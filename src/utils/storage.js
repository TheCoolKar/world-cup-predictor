// ── Legacy single-bracket keys (kept for migration only) ─────────────────────
const LEGACY_PICKS_KEY          = "wc2026_picks";
const LEGACY_SCORES_KEY         = "wc2026_scores";
const LEGACY_BRACKET_KEY        = "wc2026_bracket";
const LEGACY_BRACKET_SCORES_KEY = "wc2026_bracket_scores";

// ── Multi-bracket storage ─────────────────────────────────────────────────────
// Keys are namespaced per signed-in user so accounts sharing a browser never
// see each other's local picks. Logged-out picks live under the "guest" key.
const LEGACY_BRACKETS_KEY = "wc2026_brackets";
const MIGRATION_DONE_KEY  = "wc2026_migrated";

let activeUserId = null; // null = guest

const bracketsKey = (userId = activeUserId) =>
  `wc2026_brackets::${userId ?? "guest"}`;

function readBracketsForKey(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

function readBrackets() {
  return readBracketsForKey(bracketsKey());
}

function writeBrackets(list) {
  localStorage.setItem(bracketsKey(), JSON.stringify(list));
}

// Called by useAuth whenever the session changes. Handles the one-time rename
// of the old global key into the guest namespace, and adopts guest picks into
// a freshly signed-in account that has no local data of its own yet.
export function setActiveStorageUser(userId) {
  // Legacy global key → guest namespace (one-time)
  const legacy = localStorage.getItem(LEGACY_BRACKETS_KEY);
  if (legacy !== null) {
    if (localStorage.getItem(bracketsKey(null)) === null) {
      localStorage.setItem(bracketsKey(null), legacy);
    }
    localStorage.removeItem(LEGACY_BRACKETS_KEY);
  }

  activeUserId = userId ?? null;

  // Guest adoption: first sign-in on this browser inherits guest picks.
  // updatedAt is preserved so cloud-vs-local reconciliation stays correct.
  if (activeUserId) {
    const userKey = bracketsKey(activeUserId);
    if (localStorage.getItem(userKey) === null) {
      const guestList = readBracketsForKey(bracketsKey(null));
      if (guestList.some(b => Object.keys(b?.picks ?? {}).length > 0)) {
        localStorage.setItem(userKey, JSON.stringify(guestList));
        localStorage.removeItem(bracketsKey(null));
      }
    }
  }
}

export function getAllBrackets() {
  const list = readBrackets();
  // One-time migration: only runs if not yet done and list is empty
  if (list.length === 0 && !localStorage.getItem(MIGRATION_DONE_KEY)) {
    try {
      const oldPicks  = JSON.parse(localStorage.getItem(LEGACY_PICKS_KEY)  ?? "{}");
      const oldScores = JSON.parse(localStorage.getItem(LEGACY_SCORES_KEY) ?? "{}");
      const oldBw     = JSON.parse(localStorage.getItem(LEGACY_BRACKET_KEY) ?? "null");
      const oldBs     = JSON.parse(localStorage.getItem(LEGACY_BRACKET_SCORES_KEY) ?? "{}");
      localStorage.setItem(MIGRATION_DONE_KEY, "1");
      if (Object.keys(oldPicks).length > 0) {
        const migrated = {
          id:            "bracket_migrated",
          name:          "My Bracket",
          createdAt:     Date.now(),
          updatedAt:     Date.now(),
          picks:         oldPicks,
          scores:        oldScores,
          bracket:       oldBw,
          bracketScores: oldBs,
        };
        writeBrackets([migrated]);
        return [migrated];
      }
    } catch { /* ignore */ }
  }
  return list;
}

export function getBracketById(id) {
  return readBrackets().find(b => b.id === id) ?? null;
}

export function upsertBracket(bracket) {
  const list = readBrackets();
  const idx  = list.findIndex(b => b.id === bracket.id);
  const updated = { ...bracket, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = updated;
  else list.push(updated);
  writeBrackets(list);
  return updated;
}

export function deleteBracket(id) {
  writeBrackets(readBrackets().filter(b => b.id !== id));
}

export function createBracket(name = "My Bracket", mode = "winner") {
  const existing = getAllBrackets();
  if (existing.length > 0) return existing[0];
  return {
    id:            "bracket_" + Date.now(),
    name,
    mode,
    createdAt:     Date.now(),
    updatedAt:     Date.now(),
    picks:         {},
    scores:        {},
    bracket:       null,
    bracketScores: {},
    confidence:    {},
  };
}

// ── Legacy exports (still used internally by MyBracket per-bracket saves) ─────
// These are no-ops now — MyBracket saves the whole object via upsertBracket.
export function getPicks()  { return {}; }
export function setPick()   {}
export function clearPicks(){ }
export function getScores() { return {}; }
export function setScore()  {}
export function clearScores(){ }
export function getBracket(){ return null; }
export function saveBracket(){ }
export function clearBracket(){ }
export function getBracketScores(){ return {}; }
export function setBracketScore(){ }
export function clearBracketScores(){ }
