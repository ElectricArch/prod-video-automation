/** C08 - Conceptual demonstration inspired by Prod's engineering challenges.
 * Tests an encoding-selection policy over bytes; it contains no media encoder/presets.
 * Each encoder is an async (sourceBytes) => encodedBytes function, ordered by the caller.
 */
export async function selectPreviewBySize(original, maxBytes, encoders = []) {
  if (!(original instanceof Uint8Array) || original.byteLength === 0) {
    throw new TypeError('original must be a non-empty byte array.');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive safe integer.');
  }
  if (!Array.isArray(encoders)) throw new TypeError('encoders must be an array of functions.');
  const candidates = Array.from(encoders);
  if (candidates.some((encode) => typeof encode !== 'function')) {
    throw new TypeError('encoders must be an array of functions.');
  }
  const source = new Uint8Array(original);
  if (source.byteLength <= maxBytes) {
    return { preview: source, reusedOriginal: true, attempts: 0, encoderIndex: null };
  }

  for (const [index, encode] of candidates.entries()) {
    // Isolate attempts: an encoder that mutates its input cannot degrade the next one.
    const encoded = await encode(new Uint8Array(source));
    if (!(encoded instanceof Uint8Array) || encoded.byteLength === 0) {
      throw new TypeError('An encoder must return a non-empty byte array.');
    }
    // Successful encoding is not acceptance: measure the actual returned payload.
    if (encoded.byteLength <= maxBytes) {
      return {
        preview: new Uint8Array(encoded),
        reusedOriginal: false,
        attempts: index + 1,
        encoderIndex: index
      };
    }
  }
  throw new RangeError('No preview candidate fits the byte budget.');
}
