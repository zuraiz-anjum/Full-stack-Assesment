/**
 * The trips API has no user auth -- every visitor would otherwise share one
 * global trip list. Each browser gets a random token, persisted here, sent
 * as X-Owner-Token on every trip request. The backend scopes reads and
 * writes to it, so no visitor can see or fetch another visitor's trips.
 */
const STORAGE_KEY = "routelog:owner-token";

function randomToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOwnerToken() {
  try {
    let token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      token = randomToken();
      localStorage.setItem(STORAGE_KEY, token);
    }
    return token;
  } catch {
    // Storage unavailable -- fall back to a per-session token so requests
    // still work, just without persistence across reloads.
    return randomToken();
  }
}
