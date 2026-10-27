/** C04 - Conceptual demonstration inspired by Prod's engineering challenges.
 * Uses half-open intervals [start, end); preserves text and existing cue overlap.
 */
function parseSeconds(value) {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value.trim()) : NaN;
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError('Times must be finite nonnegative numbers or decimal strings.');
  }
  return number;
}

export function alignCaptionIntervals(cues, clip) {
  if (!Array.isArray(cues) || !clip) throw new TypeError('Provide cues and a clip interval.');
  const clipStart = parseSeconds(clip.start);
  const clipEnd = parseSeconds(clip.end);
  if (clipEnd <= clipStart) throw new RangeError('The clip must have positive duration.');
  const aligned = [];

  for (const cue of cues) {
    if (!cue || typeof cue.text !== 'string' || !cue.text.trim()) {
      throw new TypeError('Each cue must have non-blank text.');
    }
    const start = parseSeconds(cue.start);
    const end = parseSeconds(cue.end);
    if (end <= start) throw new RangeError('Cues must have positive duration.');
    const intersectionStart = Math.max(start, clipStart);
    const intersectionEnd = Math.min(end, clipEnd);
    // Touching a boundary is not overlap; never invent a minimum display duration.
    if (intersectionStart < intersectionEnd) {
      aligned.push({
        start: intersectionStart - clipStart,
        end: intersectionEnd - clipStart,
        text: cue.text
      });
    }
  }
  // Sort new records without changing the caller's source timestamps or array order.
  return aligned.sort((left, right) => left.start - right.start || left.end - right.end);
}
