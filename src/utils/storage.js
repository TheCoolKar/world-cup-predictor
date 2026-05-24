// ── Legacy single-bracket keys (kept for migration only) ─────────────────────
const LEGACY_PICKS_KEY          = "wc2026_picks";
const LEGACY_SCORES_KEY         = "wc2026_scores";
const LEGACY_BRACKET_KEY        = "wc2026_bracket";
const LEGACY_BRACKET_SCORES_KEY = "wc2026_bracket_scores";

// ── Multi-bracket storage ─────────────────────────────────────────────────────
const BRACKETS_KEY = "wc2026_brackets";

function readBrackets() {
  try { return JSON.parse(localStorage.getItem(BRACKETS_KEY)) || []; }
  catch { return []; }
}

function writeBrackets(list) {
  localStorage.setItem(BRACKETS_KEY, JSON.stringify(list));
}

export function getAllBrackets() {
  const list = readBrackets();
  // One-time migration: if old single-bracket data exists and no list yet, import it
  if (list.length === 0) {
    try {
      const oldPicks  = JSON.parse(localStorage.getItem(LEGACY_PICKS_KEY)  ?? "{}");
      const oldScores = JSON.parse(localStorage.getItem(LEGACY_SCORES_KEY) ?? "{}");
      const oldBw     = JSON.parse(localStorage.getItem(LEGACY_BRACKET_KEY) ?? "null");
      const oldBs     = JSON.parse(localStorage.getItem(LEGACY_BRACKET_SCORES_KEY) ?? "{}");
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
