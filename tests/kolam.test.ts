import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node executes the standalone TypeScript module without a bundler.
import { createPulliGrid, generateKolam, verifyKolam, kolamToSvg } from '../src/lib/kolam.ts';

test('5 × 5 default is one smooth closed circuit enclosing all 25 pulli', () => {
  const kolam = generateKolam({ seed: 'mokshith' });
  const report = verifyKolam(kolam);
  assert.equal(kolam.dots.length, 25);
  assert.equal(kolam.gates.length, 24);
  assert.equal(kolam.segments.length, 100);
  assert.deepEqual(kolam.points[0], kolam.points.at(-1));
  assert.equal(report.ok, true, report.failures.join('; '));
  assert.equal(report.circuitCount, 1);
  assert.equal(report.enclosedDots, 25);
  assert.ok(report.minClearance > kolam.dotRadius + kolam.strokeWidth / 2);
  assert.equal((kolamToSvg(kolam).match(/<path /g) ?? []).length, 1);
});

test('seed determinism is exact and different seeds change the actual graph', () => {
  assert.deepEqual(generateKolam({ seed: 'same' }), generateKolam({ seed: 'same' }));
  const paths = new Set(Array.from({ length: 30 }, (_, seed) => generateKolam({ seed }).path));
  assert.equal(paths.size, 30);
});

test('odd square and diamond grids pass across 400 seeded cases', () => {
  let cases = 0;
  for (const shape of ['square', 'diamond'] as const) for (const n of [1, 3, 5, 7, 9]) for (let seed = 0; seed < 40; seed++) {
    const kolam = generateKolam({ seed: `invariant-${seed}`, n, shape });
    const report = verifyKolam(kolam);
    assert.equal(report.ok, true, `${shape} n=${n} seed=${seed}: ${report.failures}`);
    assert.equal(report.enclosedDots, shape === 'square' ? n * n : (n * n + 1) / 2);
    cases++;
  }
  assert.equal(cases, 400);
});

test('largest supported grid stays valid', () => {
  for (const shape of ['square', 'diamond'] as const) assert.equal(verifyKolam(generateKolam({ seed: 'large', n: 21, shape })).ok, true);
});

test('verifier detects a broken stroke and a loose end', () => {
  const broken = generateKolam({ seed: 123 });
  broken.segments[10].to.x += 0.1;
  assert.equal(verifyKolam(broken).ok, false);
  assert.ok(verifyKolam(broken).failures.some((s: string) => s.includes('broken')));
  const open = generateKolam({ seed: 123 });
  open.points.pop();
  assert.equal(verifyKolam(open).closed, false);
});

test('verifier catches omitted dots, extra subpaths, and curves through a dot', () => {
  const outside = generateKolam({ seed: 123 });
  outside.dots[0].x = 100;
  assert.equal(verifyKolam(outside).ok, false);
  const multi = generateKolam({ seed: 123 });
  multi.path += ' M 0 0 Z';
  assert.equal(verifyKolam(multi).ok, false);
  const hit = generateKolam({ seed: 123 });
  hit.dots[0].x = hit.segments[0].from.x;
  hit.dots[0].y = hit.segments[0].from.y;
  assert.ok(verifyKolam(hit).failures.some((s: string) => s.includes('intersects')));
});

test('invalid and unbounded input is rejected', () => {
  for (const n of [0, 2, 4, -1, 23, 3.5, NaN, Infinity]) assert.throws(() => createPulliGrid(n));
  assert.throws(() => generateKolam({ seed: NaN }));
  assert.throws(() => createPulliGrid(5, 'circle' as never));
});
