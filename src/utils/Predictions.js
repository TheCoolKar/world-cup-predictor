/**
 * Predictions.js — match outcome predictor
 *
 * Primary model: Logistic Regression (LR)
 * ─────────────────────────────────────────
 * Replaces the hand-tuned weighted blend with a single sigmoid whose
 * coefficients are either:
 *   (a) Seed weights  — domain-knowledge estimates baked into model_weights.json
 *   (b) Trained weights — run `python scripts/train_model.py` with the Kaggle
 *       CSV to overwrite model_weights.json with data-calibrated coefficients.
 *
 * Features fed into the model:
 *   elo_diff      — (home FIFA pts − away FIFA pts) / 100
 *   form_diff     — (home competitive formScore − away formScore) / 100
 *   h2h_centered  — home H2H win rate − 0.5  (0 when no H2H history)
 *   atk_diff      — home avgGoalsFor − away avgGoalsFor  (goals/game)
 *   def_diff      — away avgGoalsAgainst − home avgGoalsAgainst
 *
 * Fallback (when hist data is missing): original blended ELO+form formula.
 *
 * Score prediction: Poisson model (unchanged).
 */

import weights        from "../data/model_weights.json";
import polymarketOdds from "../data/polymarket_odds.json";

// Prediction markets aggregate injury news, crowd wisdom, and professional
// money — when available they outperform statistical models. We blend:
//   55% market  +  45% model  (when Polymarket data exists for a fixture)
const MARKET_WEIGHT = 0.55;
const MODEL_WEIGHT  = 1 - MARKET_WEIGHT;

// ── Logistic regression core ──────────────────────────────────────────────────

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Build the feature vector and run the logistic regression.
 *
 * @param {number}      eloHome   FIFA ranking points, home team
 * @param {number}      eloAway   FIFA ranking points, away team
 * @param {object|null} histHome  team_historical_stats competitive entry, home
 * @param {object|null} histAway  team_historical_stats competitive entry, away
 * @param {object|null} h2h       h2h_stats entry for this fixture
 * @returns {{ homeWinProb, awayWinProb, features }}
 */
function runLogisticRegression(eloHome, eloAway, histHome, histAway, h2h) {
  // Feature 1 — ELO / FIFA ranking gap
  const eloDiff = (eloHome - eloAway) / 100;

  // Feature 2 — Competitive form gap (0-100 scale → normalise to 0-1)
  const formH    = histHome?.formScore ?? 50;
  const formA    = histAway?.formScore ?? 50;
  const formDiff = (formH - formA) / 100;

  // Feature 3 — Head-to-head win rate, centred at 0
  // Requires ≥2 meetings to avoid noise from a single result.
  let h2hCentered = 0;
  if (h2h?.allTime?.played >= 2) {
    const { homeTeamWins, played } = h2h.allTime;
    h2hCentered = (homeTeamWins / played) - 0.5;
  }

  // Features 4 & 5 — Attacking and defensive strength delta
  const atkH    = histHome?.avgGoalsFor     ?? 1.35;
  const atkA    = histAway?.avgGoalsFor     ?? 1.35;
  const defH    = histHome?.avgGoalsAgainst ?? 1.35;
  const defA    = histAway?.avgGoalsAgainst ?? 1.35;
  const atkDiff = atkH - atkA;   // positive → home attacks better
  const defDiff = defA - defH;   // positive → home defends better

  // Linear combination → sigmoid
  const z =
    weights.intercept        +
    weights.elo_diff     * eloDiff      +
    weights.form_diff    * formDiff     +
    weights.h2h_centered * h2hCentered  +
    weights.atk_diff     * atkDiff      +
    weights.def_diff     * defDiff;

  return {
    homeWinProb: sigmoid(z),
    awayWinProb: 1 - sigmoid(z),   // draws absorbed into binary outcome
    features: { eloDiff, formDiff, h2hCentered, atkDiff, defDiff, z },
  };
}

// ── Fallback: original blended formula ───────────────────────────────────────
// Kept as a safety net for teams that have no competitive historical stats.

const W_ELO  = 0.55;
const W_HIST = 0.25;
const W_API  = 0.20;

function eloToScore(fifaPoints) {
  return Math.min(100, Math.max(0, ((fifaPoints - 1000) / 950) * 100));
}

function runBlendedFormula(eloHome, eloAway, apiFormHome, apiFormAway, histFormHome, histFormAway) {
  const eloScoreHome = eloToScore(eloHome);
  const eloScoreAway = eloToScore(eloAway);

  const hasApi  = apiFormHome?.played  > 0 && apiFormAway?.played  > 0;
  const hasHist = histFormHome?.played > 0 && histFormAway?.played > 0;

  let wElo, wHist, wApi;
  if      (hasHist && hasApi) { wElo = W_ELO; wHist = W_HIST; wApi = W_API; }
  else if (hasHist)           { wElo = 0.65;  wHist = 0.35;   wApi = 0;     }
  else if (hasApi)            { wElo = 0.80;  wHist = 0;      wApi = 0.20;  }
  else                        { wElo = 1.0;   wHist = 0;      wApi = 0;     }

  const histScoreHome = hasHist ? histFormHome.formScore : 50;
  const histScoreAway = hasHist ? histFormAway.formScore : 50;
  const apiScoreHome  = hasApi  ? apiFormHome.formScore  : 50;
  const apiScoreAway  = hasApi  ? apiFormAway.formScore  : 50;

  const blendedHome = wElo * eloScoreHome + wHist * histScoreHome + wApi * apiScoreHome;
  const blendedAway = wElo * eloScoreAway + wHist * histScoreAway + wApi * apiScoreAway;
  const total       = blendedHome + blendedAway || 1;

  return {
    homeWinProb: blendedHome / total,
    awayWinProb: blendedAway / total,
    signals: { wElo, wHist, wApi },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Predict the outcome of a match.
 *
 * Uses logistic regression when competitive historical data is available for
 * both teams; falls back to the blended formula otherwise.
 *
 * @param {number}      eloHome      FIFA points, home team
 * @param {number}      eloAway      FIFA points, away team
 * @param {object|null} apiFormHome  team_form.json entry (API-Football)
 * @param {object|null} apiFormAway
 * @param {object|null} histFormHome team_historical_stats competitive entry
 * @param {object|null} histFormAway
 * @param {object|null} h2h          h2h_stats fixture entry (optional)
 *
 * @returns {{
 *   homeWin:  number,        — 0–100 %
 *   awayWin:  number,        — 0–100 %
 *   favorite: "home"|"away",
 *   usedForm: boolean,
 *   model:    string,        — which model path was taken
 *   signals:  object|null,   — blended formula weights (fallback only)
 *   features: object|null,   — LR feature values (primary only)
 * }}
 */
export function predictMatch(
  eloHome, eloAway,
  apiFormHome  = null, apiFormAway  = null,
  histFormHome = null, histFormAway = null,
  h2h          = null,
  fixtureId    = null,   // e.g. "A1" — used to look up Polymarket odds
) {
  const hasHistData = histFormHome?.played > 0 && histFormAway?.played > 0;

  let modelHomeProb, modelAwayProb, model, signals, features;

  if (hasHistData) {
    // ── Primary: logistic regression ───────────────────────────────────────
    const lr     = runLogisticRegression(eloHome, eloAway, histFormHome, histFormAway, h2h);
    modelHomeProb = lr.homeWinProb;
    modelAwayProb = lr.awayWinProb;
    model         = weights._trained ? "logistic_trained" : "logistic_seed";
    features      = lr.features;
    signals       = null;
  } else {
    // ── Fallback: blended formula ───────────────────────────────────────────
    const bl     = runBlendedFormula(eloHome, eloAway, apiFormHome, apiFormAway, histFormHome, histFormAway);
    modelHomeProb = bl.homeWinProb;
    modelAwayProb = bl.awayWinProb;
    model         = "blended_fallback";
    signals       = bl.signals;
    features      = null;
  }

  // ── Polymarket blend ────────────────────────────────────────────────────────
  // When live market odds exist for this fixture, blend them in.
  // Markets price in real-time information (injuries, squad news, betting flows)
  // that no statistical model can fully capture.
  const marketData   = fixtureId ? polymarketOdds[fixtureId] : null;
  const hasMarket    = marketData?.homeWinProb != null && marketData?.awayWinProb != null;

  let homeWinProb, awayWinProb;
  if (hasMarket) {
    homeWinProb = MODEL_WEIGHT * modelHomeProb + MARKET_WEIGHT * marketData.homeWinProb;
    awayWinProb = MODEL_WEIGHT * modelAwayProb + MARKET_WEIGHT * marketData.awayWinProb;
    model      += "+market";
  } else {
    homeWinProb = modelHomeProb;
    awayWinProb = modelAwayProb;
  }

  const homeWin = +(homeWinProb * 100).toFixed(1);
  const awayWin = +(awayWinProb * 100).toFixed(1);

  return {
    homeWin,
    awayWin,
    favorite:   homeWin >= 50 ? "home" : "away",
    usedForm:   hasHistData,
    usedMarket: hasMarket,
    marketOdds: hasMarket ? { home: +(marketData.homeWinProb * 100).toFixed(1), away: +(marketData.awayWinProb * 100).toFixed(1) } : null,
    model,
    signals,
    features,
  };
}

// ── Score prediction (Poisson model — unchanged) ──────────────────────────────
//
// Expected goals (xG):
//   xG = own_attack_rate × (opponent_defense_rate / base_rate)
//
// The most likely scoreline CONSISTENT with the predicted win/draw/loss
// outcome is returned (avoids the "low-xG draw beats strong favourite" bug).

const BASE_GOALS    = 1.35;
const MAX_GOALS     = 6;
const WIN_THRESHOLD = 0.525;

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

  // Dampened multiplier: prevents two elite defences collapsing each other's xG.
  const xGHome = Math.max(0.3, Math.min(4.5, atkH * (defA + BASE_GOALS) / (2 * BASE_GOALS)));
  const xGAway = Math.max(0.3, Math.min(4.5, atkA * (defH + BASE_GOALS) / (2 * BASE_GOALS)));

  let outcome;
  if      (homeWinProb >= WIN_THRESHOLD)       outcome = "home";
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

      if (fits && prob > bestProb) { bestProb = prob; predHome = h; predAway = a; }
    }
  }

  const alternatives = all
    .sort((x, y) => y.prob - x.prob)
    .filter(s => !(s.h === predHome && s.a === predAway))
    .slice(0, 3)
    .map(s => `${s.h}–${s.a}`);

  return {
    home: predHome,
    away: predAway,
    xGHome: +xGHome.toFixed(2),
    xGAway: +xGAway.toFixed(2),
    alternatives,
  };
}
