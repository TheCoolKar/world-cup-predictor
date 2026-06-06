/**
 * calculateGroupScores
 * picks:   { "A1": "home" | "away" | "draw", ... }
 * results: { "A1": { result: "home" | "away" | "draw" }, ... }
 * Returns { points, correct, incorrect }
 * Only counts matches that have a result — unplayed matches are skipped.
 */
export function calculateGroupScores(picks = {}, results = {}) {
  let points = 0, correct = 0, incorrect = 0;
  for (const [matchId, pick] of Object.entries(picks)) {
    const r = results[matchId];
    if (!r?.result) continue;
    if (pick === r.result) { points++; correct++; }
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
