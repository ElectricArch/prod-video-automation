// C04 tests use invented captions and source intervals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { alignCaptionIntervals } from '../examples/align-caption-intervals.mjs';

test('C04 normalizes decimal times and clips both ends before rebasing', () => {
  const result = alignCaptionIntervals([
    { start: ' 9 ', end: '12', text: 'synthetic opening' },
    { start: '12.5', end: '14', text: 'synthetic middle' },
    { start: 15, end: 18, text: 'synthetic ending' }
  ], { start: '10', end: '16' });
  assert.deepEqual(result, [
    { start: 0, end: 2, text: 'synthetic opening' },
    { start: 2.5, end: 4, text: 'synthetic middle' },
    { start: 5, end: 6, text: 'synthetic ending' }
  ]);
});

test('C04 discards outside and merely touching cues but keeps full containment', () => {
  const result = alignCaptionIntervals([
    { start: 1, end: 2, text: 'before' }, { start: 8, end: 10, text: 'left touch' },
    { start: 16, end: 17, text: 'right touch' }, { start: 20, end: 21, text: 'after' },
    { start: 0, end: 30, text: 'surrounds clip' }
  ], { start: 10, end: 16 });
  assert.deepEqual(result, [{ start: 0, end: 6, text: 'surrounds clip' }]);
});

test('C04 accepts an empty cue list', () => {
  assert.deepEqual(alignCaptionIntervals([], { start: 0, end: 1 }), []);
});

test('C04 sorts new records without mutating or formatting source text', () => {
  const late = Object.freeze({ start: 12, end: 13, text: '  exact text  ', privateField: 'synthetic' });
  const early = Object.freeze({ start: 10, end: 11, text: 'first' });
  const cues = Object.freeze([late, early]);
  const result = alignCaptionIntervals(cues, Object.freeze({ start: 10, end: 14 }));
  assert.deepEqual(result.map((cue) => cue.text), ['first', '  exact text  ']);
  assert.equal(cues[0], late);
  assert.equal(late.start, 12);
  assert.ok(result.every((cue) => !Object.hasOwn(cue, 'privateField')));
});

test('C04 preserves overlapping cues without adding a display-duration policy', () => {
  assert.deepEqual(alignCaptionIntervals([
    { start: 10, end: 12, text: 'one' }, { start: 11, end: 13, text: 'two' }
  ], { start: 10, end: 14 }), [
    { start: 0, end: 2, text: 'one' }, { start: 1, end: 3, text: 'two' }
  ]);
});

test('C04 rejects missing, empty, or reversed clip intervals', () => {
  for (const clip of [undefined, null, {}, { start: 1, end: 1 }, { start: 2, end: 1 }]) {
    assert.throws(() => alignCaptionIntervals([], clip));
  }
  assert.throws(() => alignCaptionIntervals(null, { start: 0, end: 1 }), TypeError);
});

test('C04 rejects coercion traps and non-finite timestamps', () => {
  for (const start of [null, true, '', ' ', {}, '1e2', '-1', -1, NaN, Infinity]) {
    assert.throws(() => alignCaptionIntervals([], { start, end: 200 }), TypeError);
    assert.throws(() => alignCaptionIntervals([{ start, end: 200, text: 'bad' }], { start: 0, end: 1 }), TypeError);
  }
});

test('C04 rejects malformed cues even if they lie outside the clip', () => {
  for (const cue of [null, {}, { start: 20, end: 20, text: 'zero' }, { start: 21, end: 20, text: 'reverse' },
    { start: 0, end: 1, text: ' ' }, { start: 0, end: 1, text: 3 }]) {
    assert.throws(() => alignCaptionIntervals([cue], { start: 10, end: 16 }));
  }
  assert.throws(() => alignCaptionIntervals(new Array(1), { start: 0, end: 1 }), TypeError);
});

test('C04 retains short subsecond intersections instead of stretching them', () => {
  const result = alignCaptionIntervals([{ start: 10.125, end: 10.25, text: 'brief' }], { start: 10, end: 11 });
  assert.deepEqual(result, [{ start: 0.125, end: 0.25, text: 'brief' }]);
});

test('C04 output intervals stay positive and within the clip on a synthetic grid', () => {
  const cues = Array.from({ length: 25 }, (_, index) => ({ start: index / 4, end: index / 4 + 0.5, text: `cue ${index}` }));
  const result = alignCaptionIntervals(cues, { start: 2, end: 4 });
  assert.equal(result.length, 9);
  assert.ok(result.every((cue) => cue.start >= 0 && cue.start < cue.end && cue.end <= 2));
  assert.ok(result.every((cue, index) => index === 0 || cue.start >= result[index - 1].start));
});
