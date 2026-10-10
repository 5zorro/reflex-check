// Run with:  npm test   (or: node --test tools/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCheck, offsetInUnits, median } from '../js/scoring.js';
import { parseMaxspeed } from '../js/drive.js';
import { simulate } from './sim_dodge.mjs';

const base = { reactionMs: 300, dodgeSec: 10 };

test('matching your baseline scores 100 and caps 5 mph under', () => {
  const r = scoreCheck({ reactionMs: 300, falseStarts: 0, dodgeSec: 10 }, base);
  assert.equal(r.score, 100);
  assert.equal(r.band.offsetMph, -5);
});

test('clearly better than baseline removes the reduction, never goes over the limit', () => {
  const r = scoreCheck({ reactionMs: 240, falseStarts: 0, dodgeSec: 13 }, base);
  assert.ok(r.score >= 110);
  assert.equal(r.band.offsetMph, 0);
});

test('much slower than baseline means do not drive', () => {
  const r = scoreCheck({ reactionMs: 520, falseStarts: 2, dodgeSec: 4 }, base);
  assert.equal(r.band.offsetMph, null);
});

test('false starts cost points', () => {
  const clean = scoreCheck({ reactionMs: 300, falseStarts: 0, dodgeSec: 10 }, base).score;
  const jumpy = scoreCheck({ reactionMs: 300, falseStarts: 3, dodgeSec: 10 }, base).score;
  assert.ok(jumpy < clean);
});

test('offsets convert to km/h', () => {
  assert.equal(offsetInUnits(-5, 'kmh'), -8);
  assert.equal(offsetInUnits(-5, 'mph'), -5);
  assert.equal(offsetInUnits(null, 'kmh'), null);
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('OSM maxspeed parsing', () => {
  assert.deepEqual(parseMaxspeed('45 mph'), { value: 45, unit: 'mph' });
  assert.deepEqual(parseMaxspeed('50'), { value: 50, unit: 'kmh' });
  assert.deepEqual(parseMaxspeed('60;80'), { value: 60, unit: 'kmh' });
  assert.equal(parseMaxspeed('none'), null);
  assert.equal(parseMaxspeed('US:urban'), null);
  assert.equal(parseMaxspeed(undefined), null);
});

test('dodge game: slower reactions survive less (virtual player)', () => {
  const runs = lag => median(Array.from({ length: 80 }, () => simulate({ lagMs: lag })));
  assert.ok(runs(700) < runs(100), 'a 700 ms player should do worse than a 100 ms player');
});
