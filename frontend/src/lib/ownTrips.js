/**
 * The trips API has no auth -- every visitor shares the same database.
 * Without this, "Recent trips" would show every other tester's searches
 * mixed in with your own. Track which trip IDs this browser actually
 * created and filter the history list down to just those.
 */
const STORAGE_KEY = "routelog:own-trip-ids";

export function getOwnTripIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function addOwnTripId(id) {
  const ids = getOwnTripIds();
  ids.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage full or unavailable -- history filtering just degrades silently.
  }
}
