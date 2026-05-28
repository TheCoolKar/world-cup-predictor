/**
 * Match outcome and score prediction helpers.
 *
 * The match winner model uses logistic regression when historical competitive
 * data exists, with a blended ELO/form fallback otherwise. Score prediction uses
 * adjusted goal rates plus a three-way Poisson model so draws remain realistic.
 */

import weights from "../data/model_weights.json";
import polymarketOdds from "../data/polymarket_odds.json";

const MARKET_WEIGHT = 0.55;
const MODEL_WEIGHT = 1 - MARKET_WEIGHT;

const BASE_GOALS = 1.35;
const MAX_GOALS = 6;

const W_ELO = 0.55;
const W_HIST = 0.25;
const W_API = 0.20;

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

function runLogisticRegression(eloHome, eloAway, histHome, histAway, h2h, neutralSite = false) {
  const eloDiff = (eloHome - eloAway) / 100;

  const confH = sampleConfidence(histHome?.played ?? 0);
  const confA = sampleConfidence(histAway?.played ?? 0);
  const formH = 50 + ((histHome?.formScore ?? 50) - 50) * confH;
  const formA = 50 + ((histAway?.formScore ?? 50) - 50) * confA;
  const formDiff = (formH - formA) / 100;

  let h2hCentered = 0;
  if (h2h?.allTime?.played >= 2) {
    const { homeTeamWins, played } = h2h.allTime;
    h2hCentered = homeTeamWins / played - 0.5;
  }

  const ratesH = getAdjustedGoalRates(histHome, eloHome);
  const ratesA = getAdjustedGoalRates(histAway, eloAway);
  const atkDiff = ratesH.avgGoalsFor - ratesA.avgGoalsFor;
  const defDiff = ratesA.avgGoalsAgainst - ratesH.avgGoalsAgainst;

  const z =
    (neutralSite ? 0 : weights.intercept) +
    weights.elo_diff * eloDiff +
    Math.max(0.6, weights.form_diff) * formDiff +
    weights.h2h_centered * h2hCentered +
    weights.atk_diff * atkDiff +
    weights.def_diff * defDiff;

  return {
    homeWinProb: sigmoid(z),
    awayWinProb: 1 - sigmoid(z),
    features: {
      eloDiff,
      formDiff,
      h2hCentered,
      atkDiff,
      defDiff,
      confidenceHome: confH,
      confidenceAway: confA,
      neutralSite,
      z,
    },
  };
}

function eloToScore(fifaPoints) {
  return Math.min(100, Math.max(0, ((fifaPoints - 1000) / 950) * 100));
}

function runBlendedFormula(eloHome, eloAway, apiFormHome, apiFormAway, histFormHome, histFormAway) {
  const eloScoreHome = eloToScore(eloHome);
  const eloScoreAway = eloToScore(eloAway);

  const hasApi = apiFormHome?.played > 0 && apiFormAway?.played > 0;
  const hasHist = histFormHome?.played > 0 && histFormAway?.played > 0;

  let wElo;
  let wHist;
  let wApi;
  if (hasHist && hasApi) {
    wElo = W_ELO;
    wHist = W_HIST;
    wApi = W_API;
  } else if (hasHist) {
    wElo = 0.65;
    wHist = 0.35;
    wApi = 0;
  } else if (hasApi) {
    wElo = 0.8;
    wHist = 0;
    wApi = 0.2;
  } else {
    wElo = 1;
    wHist = 0;
    wApi = 0;
  }

  const histScoreHome = hasHist ? histFormHome.formScore : 50;
  const histScoreAway = hasHist ? histFormAway.formScore : 50;
  const apiScoreHome = hasApi ? apiFormHome.formScore : 50;
  const apiScoreAway = hasApi ? apiFormAway.formScore : 50;

  const blendedHome = wElo * eloScoreHome + wHist * histScoreHome + wApi * apiScoreHome;
  const blendedAway = wElo * eloScoreAway + wHist * histScoreAway + wApi * apiScoreAway;
  const total = blendedHome + blendedAway || 1;

  return {
    homeWinProb: blendedHome / total,
    awayWinProb: blendedAway / total,
    signals: { wElo, wHist, wApi },
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
  const hasHistData = histFormHome?.played > 0 && histFormAway?.played > 0;

  let modelHomeProb;
  let modelAwayProb;
  let model;
  let signals;
  let features;

  if (hasHistData) {
    const lr = runLogisticRegression(
      eloHome,
      eloAway,
      histFormHome,
      histFormAway,
      h2h,
      options.neutralSite,
    );
    modelHomeProb = lr.homeWinProb;
    modelAwayProb = lr.awayWinProb;
    model = weights._trained ? "logistic_trained" : "logistic_seed";
    features = lr.features;
    signals = null;
  } else {
    const bl = runBlendedFormula(eloHome, eloAway, apiFormHome, apiFormAway, histFormHome, histFormAway);
    modelHomeProb = bl.homeWinProb;
    modelAwayProb = bl.awayWinProb;
    model = "blended_fallback";
    signals = bl.signals;
    features = null;
  }

  const marketData = fixtureId ? polymarketOdds[fixtureId] : null;
  const hasMarket = marketData?.homeWinProb != null && marketData?.awayWinProb != null;

  let homeWinProb;
  let awayWinProb;
  if (hasMarket) {
    homeWinProb = MODEL_WEIGHT * modelHomeProb + MARKET_WEIGHT * marketData.homeWinProb;
    awayWinProb = MODEL_WEIGHT * modelAwayProb + MARKET_WEIGHT * marketData.awayWinProb;
    model += "+market";
  } else {
    homeWinProb = modelHomeProb;
    awayWinProb = modelAwayProb;
  }

  const homeWin = +(homeWinProb * 100).toFixed(1);
  const awayWin = +(awayWinProb * 100).toFixed(1);

  return {
    homeWin,
    awayWin,
    favorite: homeWin >= 50 ? "home" : "away",
    usedForm: hasHistData,
    usedMarket: hasMarket,
    marketOdds: hasMarket
      ? {
          home: +(marketData.homeWinProb * 100).toFixed(1),
          away: +(marketData.awayWinProb * 100).toFixed(1),
        }
      : null,
    model,
    signals,
    features,
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

export function predictScore(histHome, histAway, homeWinProb = 0.5, eloHomeOrOptions = 1400, eloAway = 1400) {
  const options = typeof eloHomeOrOptions === "object" && eloHomeOrOptions !== null ? eloHomeOrOptions : {};
  const eloHome = typeof eloHomeOrOptions === "number" ? eloHomeOrOptions : (options.eloHome ?? 1400);
  const awayElo = typeof eloAway === "number" ? eloAway : (options.eloAway ?? 1400);
  const stage = options.stage ?? "group";

  const ratesH = getAdjustedGoalRates(histHome, eloHome);
  const ratesA = getAdjustedGoalRates(histAway, awayElo);
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

  const etProb = stage === "knockout" ? +(pDraw * 100).toFixed(1) : null;

  return {
    home: best.h,
    away: best.a,
    prob: +(best.prob * 100).toFixed(1),
    xGHome: +xGHome.toFixed(2),
    xGAway: +xGAway.toFixed(2),
    alternatives,
    etProb,
  };
}
