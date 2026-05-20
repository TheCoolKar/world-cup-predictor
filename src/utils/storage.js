const KEY         = "wc2026_picks";
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
