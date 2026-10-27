// Synthetic math and optional local FFmpeg validation of C07.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compileCropExpression } from '../examples/compile-crop-expression.mjs';

const ffmpeg = process.env.FFMPEG_TEST_BIN || 'ffmpeg';
const available = spawnSync(ffmpeg, ['-version'], { windowsHide: true, timeout: 5000 }).status === 0;

// aevalsrc uses FFmpeg's expression evaluator; no audio/video file is read or saved.
function sampleExpression(expression, rate = 4, duration = 4.25) {
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', `aevalsrc=exprs=${expression}:s=${rate}:d=${duration}`,
    '-c:a', 'pcm_f64le', '-f', 'f64le', 'pipe:1'
  ], { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message);
  assert.equal(result.stdout.length % 8, 0);
  return Array.from({ length: result.stdout.length / 8 }, (_, index) => result.stdout.readDoubleLE(index * 8));
}

test('C07 empty and single-point inputs yield constant expressions', () => {
  assert.equal(compileCropExpression([]), '0');
  assert.equal(compileCropExpression([{ time: 2, x: 7.75 }]), 'floor(7.75)');
});

test('C07 sorts without mutating input and escapes filtergraph commas', () => {
  const points = Object.freeze([Object.freeze({ time: 3, x: 6 }), Object.freeze({ time: 1, x: 4 })]);
  const expression = compileCropExpression(points);
  assert.deepEqual(points.map((point) => point.time), [3, 1]);
  assert.match(expression, /clip\(\(t-1\)\/2/);
  assert.ok(expression.includes('\\,'));
  assert.ok(!expression.replaceAll('\\,', '').includes(','));
});

test('C07 stationary intervals need no ramp terms', () => {
  assert.equal(compileCropExpression([{ time: 1, x: 5 }, { time: 3, x: 5 }]), 'floor(5)');
});

test('C07 rejects duplicate times even when positions agree', () => {
  assert.throws(() => compileCropExpression([{ time: 1, x: 5 }, { time: 1, x: 5 }]), /distinct/);
});

test('C07 rejects missing, sparse, nonnumeric, negative, and infinite data', () => {
  for (const points of [undefined, null, {}, new Array(1), [null], [{}], [{ time: '1', x: 2 }],
    [{ time: 0, x: '2' }], [{ time: -1, x: 2 }], [{ time: 1, x: -2 }],
    [{ time: Infinity, x: 2 }], [{ time: 0, x: NaN }]]) {
    assert.throws(() => compileCropExpression(points), TypeError);
  }
});

test('C07 preserves a positive sub-millisecond interval', () => {
  const expression = compileCropExpression([{ time: 0, x: 1 }, { time: 0.0000001, x: 2 }]);
  assert.ok(!expression.includes('/0,'));
  assert.match(expression, /\/1e-7/);
});

test('C07 FFmpeg samples match independent piecewise expectations', { skip: !available }, () => {
  const expression = compileCropExpression([{ time: 3, x: 6 }, { time: 1, x: 4 }, { time: 2, x: 12 }]);
  const samples = sampleExpression(expression);
  assert.equal(samples.length, 17);
  samples.forEach((value, index) => {
    const time = index / 4;
    const expected = time <= 1 ? 4 : time <= 2 ? Math.floor(4 + 8 * (time - 1))
      : time <= 3 ? Math.floor(12 - 6 * (time - 2)) : 6;
    assert.equal(value, expected, `time=${time}`);
  });
});

test('C07 FFmpeg evaluates constant, empty, and very short interval cases', { skip: !available }, () => {
  for (const [points, expected] of [
    [[], [0, 0]], [[{ time: 2, x: 7.75 }], [7, 7]],
    [[{ time: 0, x: 1 }, { time: 0.0000001, x: 2 }], [1, 2]]
  ]) {
    assert.deepEqual(sampleExpression(compileCropExpression(points), 4, 0.5), expected);
  }
});

test('C07 generated expression is accepted by the crop filter', { skip: !available }, () => {
  const expression = compileCropExpression([{ time: 0, x: 0 }, { time: 1, x: 20 }, { time: 2, x: 4 }]);
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=size=64x16:rate=4:duration=3',
    '-vf', `crop=16:16:${expression}:0:exact=1`, '-f', 'null', '-'
  ], { windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message);
});
