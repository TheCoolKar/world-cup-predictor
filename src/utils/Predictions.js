/**
 * Match outcome and score prediction helpers.
 *
 * All predictions run through a single logistic regression model trained on
 * historical matches. When a team lacks historical data, the model runs with
 * zeroed features so only the ELO signal is active. Group-stage predictions
 * are blended 55% Polymarket / 45% model when market odds exist.
 */

import weights from "../data/model_weights.json";
import polymarketOdds from "../data/polymarket_odds.json";
import eaFcRatings from "../data/ea_fc_ratings.json";
import squadQuality from "../data/team_squad_quality.json";

const MARKET_WEIGHT = 0.55;
const MODEL_WEIGHT = 1 - MARKET_WEIGHT;
const SQUAD_WEIGHT = 0.20;

const BASE_GOALS = 1.35;
const MAX_GOALS = 6;

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleConfidence(played = 0) {
  return played / (played + 30);
}

function ratingStrength(fifaPoints = 1400) {
  return clamp((fifaPoints - 1150) / 650, 0.35, 1.25);
}

export function getAdjustedGoalRates(hist, fifaPoints = 1400) {
  const played = hist?.played ?? 0;
  const confidence = sampleConfidence(played);
  const strength = ratingStrength(fifaPoints);
  const atk = hist?.avgGoalsFor ?? BASE_GOALS;
  const def = hist?.avgGoalsAgainst ?? BASE_GOALS;

  return {
    avgGoalsFor: BASE_GOALS + confidence * (atk - BASE_GOALS) * strength,
    avgGoalsAgainst: BASE_GOALS + confidence * (def - BASE_GOALS) * strength,
    confidence,
    strength,
  };
}

/**
 * Squad quality gap between two teams, on a comparable ±1.5 scale.
 *
 * Primary signal: squad market value (sum of FotMob player market values,
 * from team_squad_quality.json — regenerate with `npm run fetch-squads-stats`).
 * Expressed as log10(valueHome / valueAway) so England (~€1.5bn) vs Haiti
 * (~€20m) ≈ +1.9 while near-peers stay near 0. Market value is used instead
 * of raw FotMob player ratings because ratings aren't comparable across
 * leagues (a 7.3 in the South African league ≠ a 7.3 in the Premier League);
 * the ratings are still stored in the JSON for display.
 *
 * Fallback: EA FC game ratings (top-11 average / 10) when market values are
 * missing for either squad.
 */
function squadRatingDiff(homeTeam, awayTeam) {
  const mvH = homeTeam ? squadQuality[homeTeam]?.marketValueEur : null;
  const mvA = awayTeam ? squadQuality[awayTeam]?.marketValueEur : null;
  if (mvH > 0 && mvA > 0) {
    const diff = clamp(Math.log10(mvH / mvA), -2, 2);
    return { squadDiff: diff, squadSource: "market_value" };
  }

  const top11Home = eaFcRatings[homeTeam]?.top11_avg ?? null;
  const top11Away = eaFcRatings[awayTeam]?.top11_avg ?? null;
  if (top11Home != null && top11Away != null) {
    return { squadDiff: (top11Home - top11Away) / 10, squadSource: "eafc" };
  }
  return { squadDiff: 0, squadSource: null };
}

function runLogisticRegression(eloHome, eloAway, histHome, histAway, h2h, neutralSite = false, homeTeam = null, awayTeam = null) {
  const eloDiff = (eloHome - eloAway) / 100;

  // form_diff is excluded: the formScore scale from team_form.json does not
  // match the [0,1] win-rate scale used during training, producing an inverted
  // coefficient. The atk_diff / def_diff features already capture form indirectly.

  let h2hCentered = 0;
  if (h2h?.allTime?.played >= 2) {
    const { homeTeamWins, played } = h2h.allTime;
    h2hCentered = homeTeamWins / played - 0.5;
  }

  const ratesH = getAdjustedGoalRates(histHome, eloHome);
  const ratesA = getAdjustedGoalRates(histAway, eloAway);
  const atkDiff = ratesH.avgGoalsFor - ratesA.avgGoalsFor;
  const defDiff = ratesA.avgGoalsAgainst - ratesH.avgGoalsAgainst;

  const { squadDiff, squadSource } = squadRatingDiff(homeTeam, awayTeam);

  const z =
    (neutralSite ? 0 : weights.intercept) +
    weights.elo_diff * eloDiff +
    weights.h2h_centered * h2hCentered +
    weights.atk_diff * atkDiff +
    weights.def_diff * defDiff +
    SQUAD_WEIGHT * squadDiff;

  const hasHistData = (histHome?.played ?? 0) > 0 && (histAway?.played ?? 0) > 0;

  return {
    homeWinProb: sigmoid(z),
    awayWinProb: 1 - sigmoid(z),
    model: hasHistData ? "logistic_trained" : "logistic_elo_only",
    features: {
      eloDiff,
      h2hCentered,
      atkDiff,
      defDiff,
      squadDiff: squadDiff !== 0 ? +squadDiff.toFixed(3) : null,
      squadSource,
      neutralSite,
      z,
    },
  };
}

export function predictMatch(
  eloHome,
  eloAway,
  apiFormHome = null,
  apiFormAway = null,
  histFormHome = null,
  histFormAway = null,
  h2h = null,
  fixtureId = null,
  options = {},
) {
  const lr = runLogisticRegression(
    eloHome,
    eloAway,
    histFormHome,
    histFormAway,
    h2h,
    options.neutralSite,
    options.homeTeam ?? null,
    options.awayTeam ?? null,
  );

  const marketData = fixtureId ? polymarketOdds[fixtureId] : null;
  const hasMarket = marketData?.homeWinProb != null && marketData?.awayWinProb != null;

  let homeWinProb;
  let awayWinProb;
  let model = lr.model;
  if (hasMarket) {
    homeWinProb = MODEL_WEIGHT * lr.homeWinProb + MARKET_WEIGHT * marketData.homeWinProb;
    awayWinProb = MODEL_WEIGHT * lr.awayWinProb + MARKET_WEIGHT * marketData.awayWinProb;
    model += "+market";
  } else {
    homeWinProb = lr.homeWinProb;
    awayWinProb = lr.awayWinProb;
  }

  const homeWin = +(homeWinProb * 100).toFixed(1);
  const awayWin = +(awayWinProb * 100).toFixed(1);

  return {
    homeWin,
    awayWin,
    favorite: homeWin >= 50 ? "home" : "away",
    usedForm: (histFormHome?.played ?? 0) > 0 && (histFormAway?.played ?? 0) > 0,
    usedMarket: hasMarket,
    marketOdds: hasMarket
      ? {
          home: +(marketData.homeWinProb * 100).toFixed(1),
          away: +(marketData.awayWinProb * 100).toFixed(1),
        }
      : null,
    model,
    features: lr.features,
  };
}

function poissonProb(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function estimateDrawProb(histHome, histAway, homeWinProb) {
  const drH = (histHome?.drawRate ?? 22) / 100;
  const drA = (histAway?.drawRate ?? 22) / 100;
  const avgDraw = (drH + drA) / 2;
  const lopsidedness = 2 * Math.abs(homeWinProb - 0.5);
  const drawFactor = 1 - 0.6 * lopsidedness;

  return Math.min(0.36, Math.max(0.08, avgDraw * drawFactor));
}

export function predictScore(
  histHome,
  histAway,
  homeWinProb = 0.5,
  { eloHome = 1400, eloAway = 1400, stage = "group" } = {},
) {
  const ratesH = getAdjustedGoalRates(histHome, eloHome);
  const ratesA = getAdjustedGoalRates(histAway, eloAway);
  const atkH = ratesH.avgGoalsFor;
  const defH = ratesH.avgGoalsAgainst;
  const atkA = ratesA.avgGoalsFor;
  const defA = ratesA.avgGoalsAgainst;

  let xGHome = Math.max(0.3, Math.min(4.5, atkH * (defA + BASE_GOALS) / (2 * BASE_GOALS)));
  let xGAway = Math.max(0.3, Math.min(4.5, atkA * (defH + BASE_GOALS) / (2 * BASE_GOALS)));

  const p = Math.max(0.05, Math.min(0.95, homeWinProb));
  const probScale = Math.pow(p / (1 - p), 0.12);
  xGHome = Math.max(0.3, Math.min(4.5, xGHome * probScale));
  xGAway = Math.max(0.3, Math.min(4.5, xGAway / probScale));

  const drawProb = estimateDrawProb(histHome, histAway, homeWinProb);
  const pHome = homeWinProb * (1 - drawProb);
  const pDraw = drawProb;
  const pAway = (1 - homeWinProb) * (1 - drawProb);

  const scores = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const pp = poissonProb(xGHome, h) * poissonProb(xGAway, a);
      const ow = h > a ? pHome : h < a ? pAway : pDraw;
      const val = pp * ow;
      scores.push({ h, a, prob: val });
      total += val;
    }
  }

  scores.forEach(score => {
    score.prob /= total;
  });
  scores.sort((a, b) => b.prob - a.prob);

  const best = scores[0];
  const alternatives = scores
    .slice(1, 4)
    .map(score => ({ score: `${score.h}-${score.a}`, prob: +(score.prob * 100).toFixed(1) }));

  return {
    home: best.h,
    away: best.a,
    prob: +(best.prob * 100).toFixed(1),
    xGHome: +xGHome.toFixed(2),
    xGAway: +xGAway.toFixed(2),
    alternatives,
    etProb: stage === "knockout" ? +(pDraw * 100).toFixed(1) : null,
  };
}
