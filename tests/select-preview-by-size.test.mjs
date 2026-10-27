// Synthetic encoders test C08's policy, not video compression.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPreviewBySize } from '../examples/select-preview-by-size.mjs';

const original = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

test('C08 copies an original that fits exactly without encoding', async () => {
  const result = await selectPreviewBySize(original, 8, [() => assert.fail('must not encode')]);
  assert.deepEqual(result, { preview: original, reusedOriginal: true, attempts: 0, encoderIndex: null });
  assert.notEqual(result.preview, original);
  result.preview[0] = 99;
  assert.equal(original[0], 1);
});

test('C08 measures attempts and stops at the first candidate within budget', async () => {
  const calls = [];
  const result = await selectPreviewBySize(original, 4, [
    async (source) => { calls.push([...source]); return new Uint8Array(6); },
    async (source) => { calls.push([...source]); return Buffer.alloc(4, 9); },
    () => assert.fail('must stop at the accepted candidate')
  ]);
  assert.deepEqual(calls, [[...original], [...original]]);
  assert.deepEqual([...result.preview], [9, 9, 9, 9]);
  assert.equal(result.attempts, 2);
  assert.equal(result.encoderIndex, 1);
  assert.equal(result.reusedOriginal, false);
});

test('C08 isolates mutation between attempts and from the original', async () => {
  const before = [...original];
  await selectPreviewBySize(original, 4, [
    async (source) => { source.fill(99); return new Uint8Array(5); },
    async (source) => { assert.deepEqual([...source], before); return source.subarray(0, 4); }
  ]);
  assert.deepEqual([...original], before);
});

test('C08 does not expose an accepted encoder buffer by reference', async () => {
  const encoded = new Uint8Array([7, 8]);
  const result = await selectPreviewBySize(original, 4, [async () => encoded]);
  encoded.fill(0);
  assert.deepEqual([...result.preview], [7, 8]);
});

test('C08 serializes asynchronous attempts', async () => {
  const events = [];
  await selectPreviewBySize(original, 4, [
    async () => { events.push('first-start'); await Promise.resolve(); events.push('first-end'); return new Uint8Array(5); },
    async () => { events.push('second-start'); return new Uint8Array(3); }
  ]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start']);
});

test('C08 snapshots the finite candidate list before asynchronous work', async () => {
  const encoders = [
    async () => {
      encoders[1] = () => assert.fail('replacement must not run');
      encoders.push(() => assert.fail('late candidate must not run'));
      return new Uint8Array(5);
    },
    async () => new Uint8Array(3)
  ];
  const result = await selectPreviewBySize(original, 4, encoders);
  assert.equal(result.attempts, 2);
  assert.equal(result.preview.byteLength, 3);
});

test('C08 reports exhaustion, including an empty candidate list', async () => {
  await assert.rejects(selectPreviewBySize(original, 4, [async () => new Uint8Array(5)]), /No preview candidate/);
  await assert.rejects(selectPreviewBySize(original, 4, []), /No preview candidate/);
});

test('C08 aborts on encoder failure instead of silently retrying', async () => {
  const failure = new Error('synthetic encoder failure');
  await assert.rejects(selectPreviewBySize(original, 4, [
    async () => { throw failure; }, () => assert.fail('must not run')
  ]), (error) => error === failure);
});

test('C08 rejects invalid and empty encoder outputs', async () => {
  for (const value of [undefined, null, '', [], {}, 3, new Uint8Array(0)]) {
    await assert.rejects(selectPreviewBySize(original, 4, [async () => value]), /encoder must return/);
  }
});

test('C08 rejects invalid originals and byte budgets', async () => {
  for (const value of [null, '', [], {}, new Uint8Array(0)]) {
    await assert.rejects(selectPreviewBySize(value, 4), /original/);
  }
  for (const value of [undefined, 0, -1, 0.5, NaN, Infinity, '4', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(selectPreviewBySize(original, value), RangeError);
  }
});

test('C08 validates encoder collections before using the copy shortcut', async () => {
  for (const encoders of [null, {}, [null], new Array(1)]) {
    await assert.rejects(selectPreviewBySize(original, 8, encoders), /array of functions/);
  }
});
