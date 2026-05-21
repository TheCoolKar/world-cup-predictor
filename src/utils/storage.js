const KEY         = "wc2026_picks";
const SCORES_KEY  = "wc2026_scores";
const BRACKET_KEY = "wc2026_bracket";

export function getPicks() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function setPick(matchId, pick) {
  const picks = getPicks();
  picks[matchId] = pick;
  localStorage.setItem(KEY, JSON.stringify(picks));
}

export function clearPicks() {
  localStorage.removeItem(KEY);
}

// ── Score predictions { [matchId]: { home: number, away: number } } ───────────

export function getScores() {
  try { return JSON.parse(localStorage.getItem(SCORES_KEY) ?? "{}"); }
  catch { return {}; }
}

export function setScore(matchId, homeScore, awayScore) {
  const scores = getScores();
  scores[matchId] = { home: homeScore, away: awayScore };
  localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
}

export function clearScores() {
  localStorage.removeItem(SCORES_KEY);
}

export function getBracket() {
  try { return JSON.parse(localStorage.getItem(BRACKET_KEY) ?? "null"); }
  catch { return null; }
}

export function saveBracket(bracket) {
  localStorage.setItem(BRACKET_KEY, JSON.stringify(bracket));
}

export function clearBracket() {
  localStorage.removeItem(BRACKET_KEY);
}

// ── Knockout bracket score predictions { [round_idx]: { home, away } } ────────

const BRACKET_SCORES_KEY = "wc2026_bracket_scores";

export function getBracketScores() {
  try { return JSON.parse(localStorage.getItem(BRACKET_SCORES_KEY) ?? "{}"); }
  catch { return {}; }
}

export function setBracketScore(key, homeScore, awayScore) {
  const scores = getBracketScores();
  scores[key] = { home: homeScore, away: awayScore };
  localStorage.setItem(BRACKET_SCORES_KEY, JSON.stringify(scores));
}

export function clearBracketScores() {
  localStorage.removeItem(BRACKET_SCORES_KEY);
}
