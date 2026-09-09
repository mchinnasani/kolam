import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Native TypeScript test entry.
import {
  samplePixels,
  prepareLogoPaths,
  encodeLogo,
  decodeLogo,
  validateLogo,
  defaults,
} from "../src/logo/format.ts";
const fixture = {
  version: 1 as const,
  width: 100,
  height: 50,
  settings: { ...defaults },
  points: [-0.5, 0.25, 1, 0, 0.5, 1, 0.5, -0.25, 0, 1, 0.5, 0.5],
};
test("logo data round trips through gzip without losing settings or positions", async () => {
  const packed = await encodeLogo(fixture);
  assert.deepEqual(await decodeLogo(packed), fixture);
  assert.equal(packed[0], 31);
  assert.equal(packed[1], 139);
});
test("pixel conversion respects alpha, source color, aspect ratio and optional white removal", () => {
  const pixels = new Uint8ClampedArray(8 * 4 * 4);
  const put = (x: number, y: number, c: number[]) => pixels.set(c, (y * 8 + x) * 4);
  put(2, 2, [255, 0, 128, 255]);
  put(6, 2, [255, 255, 255, 255]);
  const all = samplePixels(pixels, 8, 4, 4, false);
  assert.equal(all.points.length, 12);
  assert.deepEqual(all.points.slice(0, 6), [-0.5, 0, 1, 0, 0.502, 1]);
  const cut = samplePixels(pixels, 8, 4, 4, true);
  assert.equal(cut.points.length, 6);
  assert.throws(() => samplePixels(new Uint8ClampedArray(8 * 4 * 4), 8, 4, 4, false), /No visible/);
});
test("prepared paths are deterministic and reach exact destinations without mutating input", () => {
  const copy = structuredClone(fixture.points),
    a = prepareLogoPaths(copy),
    b = prepareLogoPaths(copy);
  assert.deepEqual(a, b);
  assert.deepEqual(copy, fixture.points);
  for (let i = 0; i < copy.length / 6; i++) {
    assert.ok(Math.abs(a[i * 8 + 6] - copy[i * 6]) < 1e-6);
    assert.ok(Math.abs(a[i * 8 + 7] - copy[i * 6 + 1]) < 1e-6);
  }
});
test("corrupt, unsafe and unbounded files are rejected", async () => {
  assert.throws(() => validateLogo({ ...fixture, width: Infinity }));
  assert.throws(() => validateLogo({ ...fixture, points: [NaN, 0, 0, 0, 0, 1] }));
  assert.throws(() => validateLogo({ ...fixture, settings: { ...defaults, duration: 0 } }));
  assert.throws(() => validateLogo({ ...fixture, points: new Array(16001 * 6).fill(0) }));
  await assert.rejects(() => decodeLogo(new Uint8Array([1, 2, 3])));
  const huge = await new Response(
    new Blob([" ".repeat(8_000_001)]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  await assert.rejects(() => decodeLogo(new Uint8Array(huge)), /expands/);
});
