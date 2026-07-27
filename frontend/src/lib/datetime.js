/**
 * The backend returns segment start/end times as naive local-wall-clock
 * ISO strings (e.g. "2026-07-27T15:35:00") representing the time at the
 * driver's location — not UTC, and not the viewer's browser timezone.
 *
 * `new Date(isoString)` on a string with no timezone designator gets
 * reinterpreted by the browser as if it *were* the viewer's local time,
 * silently shifting the displayed clock by however many hours the viewer
 * is offset from wherever the trip actually happened. To avoid that, parse
 * the wall-clock components directly and build the Date via the
 * multi-argument constructor, which never applies any timezone conversion.
 */
export function parseWallClock(isoString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(isoString);
  if (!match) return new Date(isoString);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

export function formatWallClock(isoString) {
  return parseWallClock(isoString).toLocaleString();
}
