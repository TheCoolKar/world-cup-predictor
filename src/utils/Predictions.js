/**
 * Blended prediction using three signals:
 *
 *   55% ELO            — long-term team quality (most predictive single metric)
 *   25% Historical form — Kaggle dataset: competitive matches since 2018
 *   20% Recent form    — API-Football: last ~10 international fixtures
 *
 * Falls back gracefully when data is missing:
 *   - No API form      → 65% ELO + 35% historical
 *   - No historical    → 80% ELO + 20% API form
 *   - No form at all   → 100% ELO
 *
 * H2H data is returned separately for display — it has low standalone
 * predictive power but is useful context shown on the match card.
 */

const W_ELO  = 0.55;
const W_HIST = 0.25;
const W_API  = 0.20;

// Normalize a FIFA ranking points value to 0–100.
// Anchored to realistic WC team range: 1000 (floor) → 1950 (ceiling).
// Confirmed range for WC 2026 teams: ~1261 (Curaçao) → ~1877 (France).
function eloToScore(fifaPoints) {
  return Math.min(100, Math.max(0, ((fifaPoints - 1000) / 950) * 100));
}

export function predictMatch(
  eloHome, eloAway,
  apiFormHome  = null, apiFormAway  = null,  // from team_form.json (API-Football)
  histFormHome = null, histFormAway = null,  // from team_historical_stats.json (Kaggle)
) {
  const eloScoreHome = eloToScore(eloHome);
  const eloScoreAway = eloToScore(eloAway);

  const hasApi  = apiFormHome?.played  > 0 && apiFormAway?.played  > 0;
  const hasHist = histFormHome?.played > 0 && histFormAway?.played > 0;

  let wElo, wHist, wApi;

  if (hasHist && hasApi) {
    wElo = W_ELO; wHist = W_HIST; wApi = W_API;
  } else if (hasHist) {
    wElo = 0.65;  wHist = 0.35;   wApi = 0;
  } else if (hasApi) {
    wElo = 0.80;  wHist = 0;      wApi = 0.20;
  } else {
    wElo = 1.0;   wHist = 0;      wApi = 0;
  }

  const histScoreHome = hasHist ? histFormHome.formScore : 50;
  const histScoreAway = hasHist ? histFormAway.formScore : 50;
  const apiScoreHome  = hasApi  ? apiFormHome.formScore  : 50;
  const apiScoreAway  = hasApi  ? apiFormAway.formScore  : 50;

  const blendedHome = wElo * eloScoreHome + wHist * histScoreHome + wApi * apiScoreHome;
  const blendedAway = wElo * eloScoreAway + wHist * histScoreAway + wApi * apiScoreAway;

  const total       = blendedHome + blendedAway || 1;
  const homeWinProb = blendedHome / total;
  const awayWinProb = blendedAway / total;

  return {
    homeWin:  +(homeWinProb * 100).toFixed(1),
    awayWin:  +(awayWinProb * 100).toFixed(1),
    favorite: homeWinProb >= 0.5 ? "home" : "away",
    usedForm: hasApi || hasHist,
    signals:  { wElo, wHist, wApi },
  };
}
