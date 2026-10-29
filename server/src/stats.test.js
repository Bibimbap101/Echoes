import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, streaks, zonedMidnight, personality } from './stats.js';

test('personality: night-heavy, loyal listener', () => {
  const p = personality({ streams: 100, night: 50, morning: 5, uniqueArtists: 10, uniqueTracks: 40, top5Streams: 70, skipRate: null });
  assert.equal(p.title, 'The Night Owl Loyalist');
  assert.equal(p.traits.length, 3); // no skip trait without imported skip data
  assert.equal(personality({ streams: 0 }), null);
  const q = personality({ streams: 90, night: 5, morning: 10, uniqueArtists: 20, uniqueTracks: 20, top5Streams: 30, skipRate: 0.4 });
  assert.equal(q.title, 'The Replayer');
  assert.equal(q.traits.at(-1).value, 'Skipper');
});

test('zonedMidnight: Manila midnight is 16:00 UTC the day before', () => {
  assert.equal(zonedMidnight('2026-01-15', 'Asia/Manila').toISOString(), '2026-01-14T16:00:00.000Z');
});

test('parseRange: custom includes the whole "to" day and finds the previous period', () => {
  const r = parseRange({ range: 'custom', from: '2026-01-01', to: '2026-01-07' });
  assert.equal(r.to - r.from, 7 * 86_400_000);
  assert.equal(r.from - r.prevFrom, 7 * 86_400_000);
  assert.throws(() => parseRange({ range: 'custom', from: '2026-01-07', to: '2026-01-01' }), /before/);
  assert.throws(() => parseRange({ range: 'nope' }), /Unknown range/);
  assert.equal(parseRange({ range: 'life' }).from, null);
});

test('streaks: longest run and a current run that ended yesterday', () => {
  const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-10', '2026-01-11'];
  assert.deepEqual(streaks(days, '2026-01-12'), {
    longest: { days: 3, start: '2026-01-01', end: '2026-01-03' },
    current: 2,
  });
  assert.equal(streaks(days, '2026-01-20').current, 0);
  assert.deepEqual(streaks([], '2026-01-01'), { longest: { days: 0, start: null, end: null }, current: 0 });
});
