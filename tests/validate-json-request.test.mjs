// Tests only the prepared C01 example with synthetic bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonRequest } from '../examples/validate-json-request.mjs';

const body = { operation: ' inspect ', payload: { label: 'synthetic 🌱' } };
const bytes = Buffer.from(JSON.stringify(body));

test('C01 decodes asynchronous byte chunks split inside a multibyte character', async () => {
  async function* stream() {
    for (const byte of bytes) {
      await Promise.resolve();
      yield Uint8Array.of(byte);
    }
  }
  assert.deepEqual(await readJsonRequest(stream(), { maxBytes: bytes.length }), {
    operation: 'inspect', payload: body.payload
  });
});

test('C01 accepts an exact byte budget and an empty object payload', async () => {
  const request = Buffer.from('{"operation":"inspect","payload":{}}');
  assert.deepEqual(await readJsonRequest([request], { maxBytes: request.length }), {
    operation: 'inspect', payload: {}
  });
});

test('C01 stops an oversized iterator and counts bytes rather than characters', async () => {
  let closed = false;
  let exhausted = false;
  async function* stream() {
    try {
      yield bytes;
      exhausted = true;
      yield bytes;
    } finally {
      closed = true;
    }
  }
  const characterCount = JSON.stringify(body).length;
  assert.ok(characterCount < bytes.length);
  await assert.rejects(readJsonRequest(stream(), { maxBytes: characterCount }), RangeError);
  assert.equal(closed, true);
  assert.equal(exhausted, false);
});

test('C01 copies chunks when an iterator reuses its backing buffer', async () => {
  const buffer = new Uint8Array(bytes.length);
  const midpoint = Math.floor(bytes.length / 2);
  async function* stream() {
    buffer.set(bytes.subarray(0, midpoint));
    yield buffer.subarray(0, midpoint);
    buffer.set(bytes.subarray(midpoint));
    yield buffer.subarray(0, bytes.length - midpoint);
  }
  assert.equal((await readJsonRequest(stream(), { maxBytes: bytes.length })).payload.label, body.payload.label);
});

test('C01 rejects missing, zero, fractional, unsafe, or nonnumeric budgets', async () => {
  for (const maxBytes of [undefined, 0, -1, 1.5, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(readJsonRequest([bytes], { maxBytes }), RangeError);
  }
});

test('C01 rejects empty and whitespace-only input', async () => {
  for (const chunks of [[], [Buffer.from(' \r\n\t')]]) {
    await assert.rejects(readJsonRequest(chunks, { maxBytes: 100 }), /empty/);
  }
});

test('C01 rejects malformed JSON without echoing request content', async () => {
  const marker = 'synthetic-unreleased-note';
  await assert.rejects(readJsonRequest([Buffer.from(`{"${marker}":`)], { maxBytes: 100 }), (error) => {
    assert.ok(error instanceof SyntaxError);
    assert.ok(!error.message.includes(marker));
    return true;
  });
  await assert.rejects(readJsonRequest([Buffer.from('{}{}')], { maxBytes: 100 }), SyntaxError);
});

test('C01 rejects invalid UTF-8 instead of inserting replacement characters', async () => {
  await assert.rejects(readJsonRequest([Uint8Array.of(0xc3, 0x28)], { maxBytes: 100 }), /UTF-8/);
});

test('C01 rejects root primitives, arrays, and invalid operation names', async () => {
  for (const request of [null, [], true, 0, 'inspect', {}, { operation: 1 }, { operation: ' ' }]) {
    await assert.rejects(readJsonRequest([Buffer.from(JSON.stringify(request))], { maxBytes: 100 }), TypeError);
  }
});

test('C01 requires an object payload without validating operation-specific fields', async () => {
  for (const payload of [undefined, null, [], '', 1, true]) {
    const request = Buffer.from(JSON.stringify({ operation: 'inspect', payload }));
    await assert.rejects(readJsonRequest([request], { maxBytes: 100 }), /payload/);
  }
  const request = Buffer.from('{"operation":"custom","payload":{"anything":true}}');
  assert.deepEqual((await readJsonRequest([request], { maxBytes: 100 })).payload, { anything: true });
});

test('C01 rejects non-byte chunks', async () => {
  for (const chunk of ['text', 1, {}, new Uint16Array([1])]) {
    await assert.rejects(readJsonRequest([chunk], { maxBytes: 100 }), /byte arrays/);
  }
});

test('C01 propagates an upstream read failure', async () => {
  const failure = new Error('synthetic read failure');
  async function* stream() { yield Buffer.from('{'); throw failure; }
  await assert.rejects(readJsonRequest(stream(), { maxBytes: 100 }), (error) => error === failure);
});
