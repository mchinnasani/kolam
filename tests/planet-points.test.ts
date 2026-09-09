import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
// @ts-expect-error Node's native TypeScript runner requires the source extension.
import { decodePlanetPoints } from '../src/components/stars/planet-points.ts';

for (const kind of ['about', 'projects', 'interests']) {
  void test(`${kind}: baked data decodes into bounded GPU attributes and consistent LOD`, () => {
    const bytes = gunzipSync(readFileSync(new URL(`../public/planets/${kind}.points.gz`, import.meta.url)));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const full = decodePlanetPoints(buffer);
    const lite = decodePlanetPoints(buffer, 2);
    assert.ok(full.length > 16000 * 8);
    assert.equal(lite.length, Math.ceil(full.length / 16) * 8);
    for (let i = 0; i < full.length; i += 8) {
      for (let j = 0; j < 3; j++) assert.ok(Math.abs(full[i+j]) <= 2);
      for (let j = 3; j < 7; j++) assert.ok(full[i+j] >= 0 && full[i+j] <= 1);
      assert.ok(full[i+7] >= 0 && full[i+7] <= 2);
    }
    for (let i = 0; i < lite.length; i += 8) assert.deepEqual(lite.slice(i,i+8),full.slice(i*2,i*2+8));
    assert.throws(() => decodePlanetPoints(buffer.slice(0,-1)), /length/);
  });
}
void test('rejects invalid headers and unsupported strides', () => {
  assert.throws(() => decodePlanetPoints(new ArrayBuffer(2)), /header/);
  assert.throws(() => decodePlanetPoints(new ArrayBuffer(8)), /header/);
  const empty = new ArrayBuffer(8);
  new DataView(empty).setUint32(0,0x4b504c31,false);
  assert.throws(() => decodePlanetPoints(empty,3), /length/);
});
