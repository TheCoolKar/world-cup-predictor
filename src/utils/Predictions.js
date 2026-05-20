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

// ── Score prediction via Poisson model ───────────────────────────────────────
//
// Expected goals (xG) for each team:
//   xG = own_attack_rate × (opponent_defense_rate / base_rate)
//
// Attack rate  = team's historical avgGoalsFor  (competitive matches since 2018)
// Defense rate = team's historical avgGoalsAgainst (higher = leakier defense)
// Base rate    = average international goals per team per game (~1.35)
//
// We then blend the pure Poisson xG (70%) with a strength signal derived
// from the win probability (30%) so stronger teams get a small xG boost.
// Poisson P(k goals | lambda) = e^-λ × λ^k / k! gives the probability of
// each exact scoreline; the most likely one is returned as the prediction.

const BASE_GOALS    = 1.35; // avg goals per team per game in international football
const MAX_GOALS     = 6;    // upper limit for Poisson grid search
const WIN_THRESHOLD = 0.525; // win probability needed to predict a decisive result

function poissonProb(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function predictScore(histHome, histAway, homeWinProb = 0.5) {
  const atkH = histHome?.avgGoalsFor     ?? BASE_GOALS;
  const defH = histHome?.avgGoalsAgainst ?? BASE_GOALS;
  const atkA = histAway?.avgGoalsFor     ?? BASE_GOALS;
  const defA = histAway?.avgGoalsAgainst ?? BASE_GOALS;

  // Expected goals — dampened defense multiplier prevents two elite defenses
  // collapsing each other's xG to near zero (e.g. Brazil 0.55 vs Morocco 0.48).
  const xGHome = Math.max(0.3, Math.min(4.5, atkH * (defA + BASE_GOALS) / (2 * BASE_GOALS)));
  const xGAway = Math.max(0.3, Math.min(4.5, atkA * (defH + BASE_GOALS) / (2 * BASE_GOALS)));

  // ── Outcome-constrained selection ────────────────────────────────────────
  // The Poisson "most likely single scoreline" problem: when both xG values
  // sit near 1.3, P(1-1) edges out P(1-0) even if one team is a 65% favourite.
  // Fix: determine the predicted result from win probability first, then find
  // the most likely scoreline that is CONSISTENT with that result.
  // Only predict a draw when teams are genuinely evenly matched (within 5%).

  let outcome;
  if (homeWinProb >= WIN_THRESHOLD)            outcome = "home";
  else if (homeWinProb <= 1 - WIN_THRESHOLD)   outcome = "away";
  else                                          outcome = "draw";

  let bestProb = -1, predHome = 0, predAway = 0;
  const all = [];

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const prob = poissonProb(xGHome, h) * poissonProb(xGAway, a);
      all.push({ h, a, prob });

      const fits =
        (outcome === "home" && h > a) ||
        (outcome === "away" && a > h) ||
        (outcome === "draw" && h === a);

      if (fits && prob > bestProb) {
        bestProb = prob;
        predHome = h;
        predAway = a;
      }
    }
  }

  // Top 3 alternative scorelines (across any outcome)
  const alternatives = all
    .sort((x, y) => y.prob - x.prob)
    .filter(s => !(s.h === predHome && s.a === predAway))
    .slice(0, 3)
    .map(s => `${s.h}–${s.a}`);

  return {
    home:   predHome,
    away:   predAway,
    xGHome: +xGHome.toFixed(2),
    xGAway: +xGAway.toFixed(2),
    alternatives,
  };
}
