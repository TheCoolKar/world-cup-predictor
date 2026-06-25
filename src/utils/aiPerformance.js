function numericScore(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actualOutcome(result, homeScore, awayScore) {
  if (["home", "draw", "away"].includes(result?.result)) return result.result;
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function isScoreBearingLiveStatus(status) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return !["NS", "TBD", "CAN", "CANC", "POSTP", "POSTPONED"].includes(normalized);
}

function isFinalLiveStatus(status) {
  const normalized = String(status ?? "").trim().toUpperCase();
  return ["FT", "AET", "AP", "PEN", "FINISHED"].includes(normalized);
}

export function predictedOutcome(prediction) {
  const probabilities = [
    ["home", Number(prediction?.homeWin)],
    ["draw", Number(prediction?.draw)],
    ["away", Number(prediction?.awayWin)],
  ];
  if (probabilities.some(([, probability]) => !Number.isFinite(probability))) return null;
  return probabilities.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

function percentage(correct, total) {
  return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
}

export function buildAiPerformanceResultsMap(resultRows = [], liveRows = []) {
  const results = {};

  for (const row of resultRows ?? []) {
    if (!row?.match_id) continue;
    results[row.match_id] = row;
  }

  for (const row of liveRows ?? []) {
    if (!row?.match_id || results[row.match_id]) continue;

    const homeScore = numericScore(row.home_score);
    const awayScore = numericScore(row.away_score);
    if (homeScore == null || awayScore == null || !isScoreBearingLiveStatus(row.status)) continue;

    results[row.match_id] = {
      ...row,
      home_score: homeScore,
      away_score: awayScore,
      result: actualOutcome(row, homeScore, awayScore),
      provisional: !isFinalLiveStatus(row.status),
      source: row.source ?? "live",
    };
  }

  return results;
}

/**
 * Grades the frozen pre-match model snapshot against score-bearing group matches.
 * A match is a hit when either the most likely outcome or the likeliest exact
 * scoreline is correct. Each match can contribute at most one hit. Live rows
 * are provisional until the final match_results row arrives.
 */
export function calculateAiPerformance(fixtures = [], predictions = {}, results = {}) {
  let completed = 0;
  let played = 0;
  let hits = 0;
  let outcomeCorrect = 0;
  let exactScoreCorrect = 0;
  let provisional = 0;

  for (const fixture of fixtures) {
    const result = results[fixture.id];
    const homeScore = numericScore(result?.home_score);
    const awayScore = numericScore(result?.away_score);
    if (homeScore == null || awayScore == null) continue;
    completed++;

    const prediction = predictions[fixture.id];
    const modelOutcome = predictedOutcome(prediction);
    const predictedHomeScore = numericScore(prediction?.score?.home);
    const predictedAwayScore = numericScore(prediction?.score?.away);
    if (modelOutcome == null || predictedHomeScore == null || predictedAwayScore == null) continue;
    played++;
    if (result?.provisional) provisional++;

    const outcomeHit = modelOutcome === actualOutcome(result, homeScore, awayScore);
    const exactScoreHit = predictedHomeScore === homeScore && predictedAwayScore === awayScore;
    if (outcomeHit) outcomeCorrect++;
    if (exactScoreHit) exactScoreCorrect++;
    if (outcomeHit || exactScoreHit) hits++;
  }

  return {
    completed,
    played,
    hits,
    outcomeCorrect,
    exactScoreCorrect,
    provisional,
    successRate: percentage(hits, played),
    outcomeRate: percentage(outcomeCorrect, played),
    exactScoreRate: percentage(exactScoreCorrect, played),
  };
}
