import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's native TypeScript runner requires the source extension.
import { kolamJourney } from '../src/lib/kolam-journey.ts';

void test('opening stays unformed; travel starts before formation', () => {
  assert.equal(kolamJourney(0).formation, 0);
  assert.equal(kolamJourney(0.1).formation, 0);
  assert.ok(kolamJourney(0.1).travel > 0);
});
void test('camera travel and formation overlap through the middle of the journey', () => {
  for (const p of [0.3, 0.5, 0.7]) {
    const frame = kolamJourney(p);
    assert.ok(frame.formation > 0 && frame.formation < 1);
    assert.ok(frame.travel > 0 && frame.travel < 1);
    assert.equal(frame.revealed, false);
    assert.equal(frame.opacity, 1);
  }
});
void test('completed artwork is held before chapters appear', () => {
  assert.equal(kolamJourney(0.88).formation, 1);
  assert.equal(kolamJourney(0.88).revealed, false);
  assert.equal(kolamJourney(0.88).opacity, 1);
  assert.equal(kolamJourney(0.94).revealed, true);
});
void test('scrubbing is deterministic and progress stays bounded', () => {
  const middle = kolamJourney(0.5);
  kolamJourney(1);
  assert.deepEqual(kolamJourney(0.5), middle);
  assert.deepEqual(kolamJourney(-1), kolamJourney(0));
  assert.deepEqual(kolamJourney(2), kolamJourney(1));
});
