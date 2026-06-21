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

/**
 * Grades the frozen pre-match model snapshot against completed group matches.
 * A match is a hit when either the most likely outcome or the likeliest exact
 * scoreline is correct. Each completed match can contribute at most one hit.
 */
export function calculateAiPerformance(fixtures = [], predictions = {}, results = {}) {
  let completed = 0;
  let played = 0;
  let hits = 0;
  let outcomeCorrect = 0;
  let exactScoreCorrect = 0;

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
    successRate: percentage(hits, played),
    outcomeRate: percentage(outcomeCorrect, played),
    exactScoreRate: percentage(exactScoreCorrect, played),
  };
}
