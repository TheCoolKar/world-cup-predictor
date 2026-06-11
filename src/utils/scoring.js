import fixtures from "../data/wc2026_fixtures.json";

/** Clamp an arbitrary stored value to a valid confidence multiplier (1, 2 or 3). */
export function normalizeConfidence(value) {
  return value === 2 || value === 3 ? value : 1;
}

/**
 * calculateGroupScores
 * picks:      { "A1": "home" | "away" | "draw", ... }
 * results:    { "A1": { result: "home" | "away" | "draw" }, ... }
 * confidence: { "A1": 1 | 2 | 3, ... } — multiplies points on correct picks
 * Returns { points, correct, incorrect }
 * Only counts matches that have a result — unplayed matches are skipped.
 */
export function calculateGroupScores(picks = {}, results = {}, confidence = {}) {
  let points = 0, correct = 0, incorrect = 0;
  for (const [matchId, pick] of Object.entries(picks)) {
    const r = results[matchId];
    if (!r?.result) continue;
    if (pick === r.result) { points += normalizeConfidence(confidence[matchId]); correct++; }
    else { incorrect++; }
  }
  return { points, correct, incorrect };
}

/**
 * buildResultsMap
 * Converts a Supabase match_results array into a keyed lookup object.
 * rows: [{ match_id, result, home_score, away_score }, ...]
 */
export function buildResultsMap(rows = []) {
  return Object.fromEntries(rows.map(r => [r.match_id, r]));
}

// Kickoff ordering for streaks — date + ET time parsed to a sortable number.
function kickoffValue(fixture) {
  const clean = (fixture.time ?? "12:00 PM").replace(" ET", "").trim();
  const [time, meridiem] = clean.split(" ");
  let [h, m] = (time ?? "12:00").split(":").map(Number);
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  return new Date(`${fixture.date}T00:00:00Z`).getTime() + (h * 60 + (m || 0)) * 60000;
}

const FIXTURES_CHRONOLOGICAL = [...fixtures].sort((a, b) => kickoffValue(a) - kickoffValue(b));

/**
 * calculateStreaks
 * Walks the user's graded picks in kickoff order.
 * current = consecutive correct picks ending at their most recent graded match
 * best    = longest correct run overall
 * Returns { current, best, graded }
 */
export function calculateStreaks(picks = {}, results = {}) {
  let current = 0, best = 0, graded = 0;
  for (const f of FIXTURES_CHRONOLOGICAL) {
    const pick = picks[f.id];
    const r = results[f.id];
    if (pick == null || !r?.result) continue;
    graded++;
    if (pick === r.result) { current++; if (current > best) best = current; }
    else { current = 0; }
  }
  return { current, best, graded };
}
