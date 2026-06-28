/**
 * survivorScoring.js — Survivor Score engine (independent of slot scoring)
 *
 * Awards points for correctly predicting WHICH TEAMS survive into each knockout
 * round, regardless of matchup or path. Order doesn't matter — only set membership.
 *
 * Points per correctly-predicted survivor, by destination round:
 *   Into R16 (16 real survivors from R32): 1 pt each — max 16 pts
 *   Into QF  (8 real survivors from R16): 2 pts each — max 16 pts
 *   Into SF  (4 real survivors from QF):  4 pts each — max 16 pts
 *   Into F   (2 real survivors from SF):  8 pts each — max 16 pts
 *   Max possible Survivor Score: 64 points
 *
 * A survivor round is only scored once ALL matches in the preceding round have
 * a known result and team data — the same completion guard the slot scorer uses.
 * If any feeding match is still pending, the whole survivor round returns 0.
 *
 * DO NOT import from or modify bracketScoring.js — this is a fully separate system.
 */

// FIFA match-number base for each round (same constant as in bracketScoring.js / MyBracket.jsx)
const ROUND_BASE   = { R32: 73, R16: 89, QF: 97, SF: 101 };
const ROUND_COUNTS = { R32: 16, R16: 8,  QF: 4,  SF: 2 };

// Survivor rounds: which source round must be fully complete, and how many pts per correct team
const SURVIVOR_CONFIG = [
  { survivorRound: 'R16', sourceRound: 'R32', pointsPerTeam: 1 },
  { survivorRound: 'QF',  sourceRound: 'R16', pointsPerTeam: 2 },
  { survivorRound: 'SF',  sourceRound: 'QF',  pointsPerTeam: 4 },
  { survivorRound: 'F',   sourceRound: 'SF',  pointsPerTeam: 8 },
];

/**
 * Derive the set of real match-winners from a completed round.
 * Returns null (= round not yet complete) if any match in the source round is
 * missing a result entry or missing team-name data in live_matches.
 * This mirrors the "pending" guard in the slot scorer: same data, same check.
 */
function getRealSurvivors(sourceRound, resultsMap, liveMatchMap) {
  const base    = ROUND_BASE[sourceRound];
  const count   = ROUND_COUNTS[sourceRound];
  const winners = new Set();

  for (let i = 0; i < count; i++) {
    const matchId = `M${base + i}`;
    const result  = resultsMap[matchId];
    if (!result) return null;                          // match not yet played

    const live       = liveMatchMap[matchId];
    const actualHome = live?.home_team ?? null;
    const actualAway = live?.away_team ?? null;
    if (!actualHome || !actualAway) return null;       // team data not yet available

    const winner = result.result === 'home' ? actualHome
      : result.result === 'away' ? actualAway
      : null;
    if (!winner) return null;                          // data quality guard (KO can't draw)

    winners.add(winner);
  }

  return winners;
}

/**
 * Derive the set of teams the user predicted to survive into a given round.
 * Predicted survivors into a round = the bracket picks (winners) from the prior round.
 *   Into R16 → bracket.R32  (who the user thinks wins each R32 match)
 *   Into QF  → bracket.R16
 *   Into SF  → bracket.QF
 *   Into F   → bracket.SF
 */
function getPredictedSurvivors(survivorRound, bracket) {
  const sourceRoundMap = { R16: 'R32', QF: 'R16', SF: 'QF', F: 'SF' };
  const picks = bracket?.[sourceRoundMap[survivorRound]] ?? [];
  return new Set(picks.filter(Boolean));
}

/**
 * Score the Survivor component of a bracket submission.
 *
 * Idempotent — same inputs always produce the same output.
 * Re-run freely as new results arrive.
 *
 * @param {Object|null} bracket      - submissions.bracket:
 *                                     { R32:[team|null,...×16], R16:[...×8], QF:[...×4], SF:[...×2], ... }
 * @param {Object}      resultsMap   - match_results keyed by match_id
 *                                     { "M73": { result:"home"|"away", ... }, ... }
 * @param {Object}      liveMatchMap - live_matches keyed by match_id
 *                                     { "M73": { home_team, away_team }, ... }
 * @returns {{ roundBreakdown: Object, totalPoints: number }}
 *   roundBreakdown is JSON-serialisable, suitable for storing in survivor_breakdown:
 *     {
 *       R16: { correct: number, points: number, complete: boolean },
 *       QF:  { ... },
 *       SF:  { ... },
 *       F:   { ... },
 *     }
 *   totalPoints sums points from all complete rounds only.
 */
export function scoreSurvivor(bracket, resultsMap = {}, liveMatchMap = {}) {
  const roundBreakdown = {};
  let totalPoints = 0;

  for (const { survivorRound, sourceRound, pointsPerTeam } of SURVIVOR_CONFIG) {
    const realSurvivors = getRealSurvivors(sourceRound, resultsMap, liveMatchMap);

    if (realSurvivors === null) {
      // Source round not fully resolved — don't award partial credit
      roundBreakdown[survivorRound] = { correct: 0, points: 0, complete: false };
      continue;
    }

    const predictedSurvivors = getPredictedSurvivors(survivorRound, bracket);
    let correct = 0;
    for (const team of predictedSurvivors) {
      if (realSurvivors.has(team)) correct++;
    }

    const points = correct * pointsPerTeam;
    totalPoints += points;
    roundBreakdown[survivorRound] = { correct, points, complete: true };
  }

  return { roundBreakdown, totalPoints };
}
