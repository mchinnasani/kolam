import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
// @ts-ignore Native TS entry.
import { extractForeground, normalizeForeground } from "../src/logo/foreground.ts";
// @ts-ignore Native TS entry.
import { samplePixels } from "../src/logo/format.ts";
// @ts-ignore Native TS entry.
import { makeFixtures, png } from "../scripts/foreground-fixtures.ts";
const output = new URL("../artifacts/foreground/", import.meta.url);
mkdirSync(output, { recursive: true });
const report: any[] = [],
  particleCases: any[] = [];
for (const fixture of makeFixtures())
  test(`foreground: ${fixture.name}`, () => {
    const { name, pixels, width, height, expected } = fixture;
    writeFileSync(new URL(`${name}.png`, output), png(pixels, width, height));
    const result = extractForeground(pixels, width, height),
      normalized = normalizeForeground(result, 0.06),
      particles = samplePixels(normalized.pixels, normalized.width, normalized.height, 4, false);
    const b = result.info.bounds;
    writeFileSync(
      new URL(`${name}-crop.png`, output),
      png(normalized.pixels, normalized.width, normalized.height),
    );
    const debug = pixels.slice();
    for (let y = b.y; y < b.y + b.height; y++)
      for (let x = b.x; x < b.x + b.width; x++)
        if (y === b.y || y === b.y + b.height - 1 || x === b.x || x === b.x + b.width - 1)
          debug.set([255, 30, 90, 255], (y * width + x) * 4);
    writeFileSync(new URL(`${name}-bounds.png`, output), png(debug, width, height));
    // Rasterize the exact generated point data for a visual contact sheet.
    const rendered = new Uint8ClampedArray(480 * 480 * 4);
    for (let i = 0; i < rendered.length; i += 4) rendered.set([8, 11, 16, 255], i);
    for (let i = 0; i < particles.points.length; i += 6) {
      const x = Math.round(240 + particles.points[i] * 220),
        y = Math.round(240 - particles.points[i + 1] * 220);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = ((y + dy) * 480 + x + dx) * 4;
          if (k >= 0 && k < rendered.length) rendered.set([130, 210, 255, 255], k);
        }
    }
    writeFileSync(new URL(`${name}-particles.png`, output), png(rendered, 480, 480));
    const xs = particles.points.filter((_: number, i: number) => i % 6 === 0),
      ys = particles.points.filter((_: number, i: number) => i % 6 === 1);
    const particleRatio = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    report.push({
      name,
      expected,
      ...result.info,
      normalized: { width: normalized.width, height: normalized.height, scale: normalized.scale },
      particleCount: particles.points.length / 6,
      particleRatio,
    });
    particleCases.push({ name, data: particles });
    writeFileSync(new URL("particle-cases.json", output), JSON.stringify(particleCases));
    writeFileSync(new URL("report.json", output), JSON.stringify(report, null, 2));
    assert.equal(result.info.strategy, fixture.strategy);
    for (const key of ["x", "y", "width", "height"] as const)
      assert.ok(
        Math.abs(b[key] - expected[key]) <= 2,
        `${key}: detected ${b[key]}, expected ${expected[key]}`,
      );
    assert.ok(
      Math.abs(particleRatio / (b.width / b.height) - 1) < 0.12,
      `particle aspect ${particleRatio}, crop ${b.width / b.height}`,
    );
    assert.ok(Math.max(...xs) - Math.min(...xs) > 0.1 && Math.max(...ys) - Math.min(...ys) > 0.1);
    assert.ok(
      Math.max(...xs) < 0.98 &&
        Math.min(...xs) > -0.98 &&
        Math.max(...ys) < 0.98 &&
        Math.min(...ys) > -0.98,
    );
    assert.ok(particles.points.length / 6 < 16000);
    assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2) < 0.025, "horizontal centering");
    assert.ok(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2) < 0.025, "vertical centering");
    if (name === "disconnected") assert.equal(result.info.components, 3);
    if (name === "small-detached-detail") assert.equal(result.info.components, 2);
    if (name === "soft-glow") {
      const a = particles.points.filter((_: number, i: number) => i % 6 === 5);
      assert.ok(Math.min(...a) < 0.2 && Math.max(...a) > 0.95);
    }
  });
test("empty and invalid inputs do not produce a paper rectangle", () => {
  assert.throws(
    () => extractForeground(new Uint8ClampedArray(100 * 100 * 4), 100, 100),
    /No clear/,
  );
  assert.throws(
    () => extractForeground(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100),
    /No clear/,
  );
  assert.throws(() => extractForeground(new Uint8ClampedArray(4), 0, 1), /dimensions/);
});

test("JPEG compression preserves object bounds", () => {
  const pixels = new Uint8ClampedArray(
    gunzipSync(readFileSync(new URL("./fixtures/logo-jpeg.rgba.gz", import.meta.url))),
  );
  const result = extractForeground(pixels, 700, 500);
  const expected = { x: 240, y: 170, width: 200, height: 160 };
  assert.equal(result.info.strategy, "border-color");
  for (const key of ["x", "y", "width", "height"] as const)
    assert.ok(Math.abs(result.info.bounds[key] - expected[key]) <= 4);
  const normalized = normalizeForeground(result);
  const points = samplePixels(normalized.pixels, normalized.width, normalized.height, 4, false);
  assert.ok(points.points.length > 0);
});
