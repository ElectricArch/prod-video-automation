/** C01 - Adapted and extended excerpt for standalone request validation.
 * Reads one byte-stream request; operation-specific payload validation is separate.
 */
import { TextDecoder } from 'node:util';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function readJsonRequest(stream, { maxBytes } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive safe integer.');
  }
  const chunks = [];
  let byteCount = 0;
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('The stream must yield byte arrays.');
    }
    byteCount += chunk.byteLength;
    if (byteCount > maxBytes) throw new RangeError('Request exceeds the byte budget.');
    chunks.push(Buffer.from(chunk));
  }

  // Decode once so a character split between chunks remains intact; reject bad UTF-8.
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)).trim();
  } catch {
    throw new TypeError('Request must contain valid UTF-8.');
  }
  if (!text) throw new SyntaxError('Request is empty.');
  let request;
  try {
    request = JSON.parse(text);
  } catch {
    // Do not echo request content in a parsing error.
    throw new SyntaxError('Request is not a single JSON value.');
  }
  if (!isRecord(request) || typeof request.operation !== 'string' || !request.operation.trim()) {
    throw new TypeError('Request must name a non-empty operation.');
  }
  if (!isRecord(request.payload)) throw new TypeError('payload must be an object.');
  return { operation: request.operation.trim(), payload: request.payload };
}
