/**
 * bracketScoring.js — knockout bracket scoring engine
 *
 * Scores a user's submitted bracket against real-world knockout results.
 * Brackets were submitted in full before the Round of 32 started, so many
 * slots reference matchups that can never happen once real results come in.
 *
 * Per-slot status:
 *   pending — real-world match hasn't been played yet (or no pick recorded)
 *   void    — one or both teams the user predicted for this slot didn't actually
 *             reach it; the slot cannot be graded (scores 0, not a miss)
 *   correct — both predicted teams reached this slot AND the user picked the winner
 *   wrong   — both predicted teams reached this slot but the user picked the loser
 *
 * Points per correct slot: R32=1, R16=2, QF=4, SF=8, Final=16.
 * 3rd-place match is tracked for status but earns no points.
 */

const ROUND_POINTS = { R32: 1, R16: 2, QF: 4, SF: 8, F: 16 };

// FIFA match number base for each round (mirrors ROUND_BASE in MyBracket.jsx)
const ROUND_BASE   = { R32: 73, R16: 89, QF: 97, SF: 101, F: 104 };

const ROUND_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 };
const KO_ROUNDS    = ['R32', 'R16', 'QF', 'SF', 'F'];

// Which two previous-round match slots feed into each slot (mirrors MATCH_SOURCES in MyBracket.jsx).
// Format: [homeSourceRound, homeSourceIdx, awaySourceRound, awaySourceIdx]
const MATCH_SOURCES = {
  R16: [
    ['R32', 1, 'R32', 4], ['R32', 0, 'R32', 2], ['R32', 3, 'R32', 5],  ['R32', 6, 'R32', 7],
    ['R32', 10, 'R32', 11], ['R32', 8, 'R32', 9], ['R32', 13, 'R32', 15], ['R32', 12, 'R32', 14],
  ],
  QF: [
    ['R16', 0, 'R16', 1], ['R16', 4, 'R16', 5], ['R16', 2, 'R16', 3], ['R16', 6, 'R16', 7],
  ],
  SF: [['QF', 0, 'QF', 1], ['QF', 2, 'QF', 3]],
  F:  [['SF', 0, 'SF', 1]],
};

/**
 * Determine the status of a single bracket slot.
 *
 * For R32: only the user's predicted winner is checked against the actual teams
 * (we can't verify the predicted opponent without recomputing group standings from
 * the user's group picks, which is outside this utility's scope).
 *
 * For R16+: both predicted teams (derived from the user's previous-round picks via
 * MATCH_SOURCES) are compared against the actual teams in the real-world match.
 */
function scoreSlot(round, i, bracket, resultsMap, liveMatchMap) {
  const userPick = bracket?.[round]?.[i] ?? null;
  if (!userPick) return 'pending';

  const matchId = `M${ROUND_BASE[round] + i}`;
  const result  = resultsMap[matchId];
  if (!result) return 'pending';

  const live       = liveMatchMap[matchId];
  const actualHome = live?.home_team ?? null;
  const actualAway = live?.away_team ?? null;
  if (!actualHome || !actualAway) return 'pending';

  // Knockout matches always have a winner; "draw" indicates a data quality issue.
  const actualWinner = result.result === 'home' ? actualHome
    : result.result === 'away' ? actualAway
    : null;
  if (!actualWinner) return 'pending';

  if (round === 'R32') {
    // R32: void if the user's pick isn't one of the actual teams in this slot.
    if (userPick !== actualHome && userPick !== actualAway) return 'void';
    return userPick === actualWinner ? 'correct' : 'wrong';
  }

  // R16+: derive both predicted teams from the user's previous-round picks.
  const [hr, hi, ar, ai] = MATCH_SOURCES[round][i];
  const predictedHome = bracket?.[hr]?.[hi] ?? null;
  const predictedAway = bracket?.[ar]?.[ai] ?? null;

  // If either predicted team is missing (incomplete bracket), treat as void.
  if (!predictedHome || !predictedAway) return 'void';

  const bothMatch =
    (predictedHome === actualHome  && predictedAway === actualAway) ||
    (predictedHome === actualAway  && predictedAway === actualHome);

  if (!bothMatch) return 'void';
  return userPick === actualWinner ? 'correct' : 'wrong';
}

/**
 * Score a user's full knockout bracket against real-world results.
 *
 * Idempotent: calling with the same inputs always returns the same output.
 * Re-run freely whenever new results land.
 *
 * @param {Object|null} bracket      - submissions.bracket:
 *                                     { R32:[team|null,...×16], R16:[...×8], QF:[...×4], SF:[...×2], F:[...×1], "3P":[...×1] }
 * @param {Object}      resultsMap   - match_results keyed by match_id (use buildResultsMap from scoring.js):
 *                                     { "M73": { result:"home"|"away", home_score, away_score }, ... }
 * @param {Object}      liveMatchMap - live_matches keyed by match_id:
 *                                     { "M73": { home_team, away_team }, ... }
 * @returns {{ slotStatuses: Object, totalPoints: number }}
 *   slotStatuses mirrors bracket shape but each slot holds 'correct'|'wrong'|'void'|'pending'.
 *   totalPoints is the sum of points from 'correct' slots only.
 */
export function scoreBracket(bracket, resultsMap = {}, liveMatchMap = {}) {
  const slotStatuses = {};
  let totalPoints = 0;

  for (const round of KO_ROUNDS) {
    slotStatuses[round] = [];
    for (let i = 0; i < ROUND_COUNTS[round]; i++) {
      const status = scoreSlot(round, i, bracket, resultsMap, liveMatchMap);
      slotStatuses[round].push(status);
      if (status === 'correct') totalPoints += ROUND_POINTS[round];
    }
  }

  // 3rd-place match (M103) is not tracked by the live feed, so will always be pending.
  // Included in slotStatuses for schema completeness; earns no points.
  const thirdPick   = bracket?.['3P']?.[0] ?? null;
  const thirdResult = resultsMap['M103'];
  const thirdLive   = liveMatchMap['M103'];
  if (!thirdPick || !thirdResult) {
    slotStatuses['3P'] = ['pending'];
  } else {
    const aHome = thirdLive?.home_team ?? null;
    const aAway = thirdLive?.away_team ?? null;
    if (!aHome || !aAway || (thirdPick !== aHome && thirdPick !== aAway)) {
      slotStatuses['3P'] = ['void'];
    } else {
      const winner = thirdResult.result === 'home' ? aHome : aAway;
      slotStatuses['3P'] = [thirdPick === winner ? 'correct' : 'wrong'];
    }
  }

  return { slotStatuses, totalPoints };
}
