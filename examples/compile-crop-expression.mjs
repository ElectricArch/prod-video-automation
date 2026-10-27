/** C07 - Conceptual demonstration inspired by Prod's engineering challenges.
 * Compiles supplied {time, x} points, not subject selection or tracking decisions.
 */
export function compileCropExpression(points) {
  if (!Array.isArray(points)) throw new TypeError('points must be an array.');
  const ordered = Array.from(points, (point) => {
    if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.x)
      || point.time < 0 || point.x < 0) {
      throw new TypeError('Each point needs finite, nonnegative time and x numbers.');
    }
    return { time: point.time, x: point.x };
  }).sort((left, right) => left.time - right.time);
  if (ordered.length === 0) return '0';

  const terms = [String(ordered[0].x)];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const duration = current.time - previous.time;
    if (duration <= 0) throw new RangeError('Keyframe times must be distinct.');
    const displacement = current.x - previous.x;
    if (displacement !== 0) {
      // A clipped ramp contributes zero before its interval and its full delta after it.
      terms.push(`(${displacement})*clip((t-${previous.time})/${duration},0,1)`);
    }
  }
  // Summed ramps hold both endpoints; no nested conditional tree is needed.
  // This is an FFmpeg filtergraph value, not a shell-escaped command.
  return `floor(${terms.join('+')})`.replaceAll(',', '\\,');
}
