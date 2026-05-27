/**
 * TournamentSimulator.js
 *
 * Simulates the full FIFA World Cup 2026 tournament:
 *   1. Group stage  — predict all 72 matches, compute standings
 *   2. Best-8 third — rank the 12 third-placed teams, pick top 8
 *   3. Round of 32  — 16 matches using predefined bracket structure
 *   4. R16 → QF → SF → Final — single-elimination until champion
 *
 * All predictions are deterministic (best-guess, no randomness).
 * A team with homeWinProb >= 0.5 wins; ties broken by ELO.
 */

import { predictMatch, predictScore } from "./Predictions";
import fixtures       from "../data/wc2026_fixtures.json";
import eloRatings     from "../data/elo_ratings.json";
import teamForm       from "../data/team_form.json";
import historicalStats from "../data/team_historical_stats.json";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiForm(team)  { return teamForm[team]          ?? null; }
function getHist(team)     { return historicalStats[team]   ?? null; }
function getElo(team)      { return eloRatings[team]        ?? 1400; }

/** Predict a match and return { homeWin (0-1), awayWin (0-1), score } */
function simulateMatch(home, away, fixtureId = null, stage = "group") {
  const pred = predictMatch(
    getElo(home), getElo(away),
    getApiForm(home), getApiForm(away),
    getHist(home)?.competitive,
    getHist(away)?.competitive,
    null,        // h2h — not pre-computed for simulator
    fixtureId,   // Polymarket fixture ID (group stage only)
  );
  const homeWinProb = pred.homeWin / 100;
  const score = predictScore(
    getHist(home)?.competitive,
    getHist(away)?.competitive,
    homeWinProb,
    { stage },
  );
  return { homeWinProb, awayWinProb: pred.awayWin / 100, score, signals: pred.signals };
}

/** In a knockout match, winner is whoever has prob ≥ 0.5. Ties broken by ELO. */
function knockoutWinner(home, away) {
  const { homeWinProb, score } = simulateMatch(home, away, null, "knockout");
  const homeWins = homeWinProb >= 0.5
    ? true
    : homeWinProb === 0.5
      ? getElo(home) >= getElo(away)   // dead-tie fallback
      : false;
  return {
    winner: homeWins ? home : away,
    loser:  homeWins ? away : home,
    homeWinProb,
    score,
    home,
    away,
  };
}

// ── 1. Group Stage ────────────────────────────────────────────────────────────

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

function simulateGroupStage() {
  const groupResults = {}; // group → array of { home, away, homeGoals, awayGoals, homeWinProb }

  for (const fixture of fixtures) {
    const { id, group, home, away } = fixture;
    const { homeWinProb, score } = simulateMatch(home, away, id);
    if (!groupResults[group]) groupResults[group] = [];
    groupResults[group].push({ home, away, homeGoals: score.home, awayGoals: score.away, homeWinProb });
  }

  // Build standings for each group
  const standings = {}; // group → sorted array of team stats

  for (const group of GROUPS) {
    const matches = groupResults[group] || [];
    const stats   = {};   // team → { pts, gf, ga, gd, w, d, l, played }

    // Collect all teams in this group
    for (const m of matches) {
      for (const t of [m.home, m.away]) {
        if (!stats[t]) stats[t] = { team: t, pts: 0, gf: 0, ga: 0, gd: 0, w: 0, d: 0, l: 0, played: 0 };
      }
    }

    for (const m of matches) {
      const { home, away, homeGoals, awayGoals } = m;
      stats[home].played++; stats[away].played++;
      stats[home].gf += homeGoals; stats[home].ga += awayGoals;
      stats[away].gf += awayGoals; stats[away].ga += homeGoals;
      stats[home].gd = stats[home].gf - stats[home].ga;
      stats[away].gd = stats[away].gf - stats[away].ga;

      if (homeGoals > awayGoals)      { stats[home].pts += 3; stats[home].w++; stats[away].l++; }
      else if (homeGoals < awayGoals) { stats[away].pts += 3; stats[away].w++; stats[home].l++; }
      else                            { stats[home].pts += 1; stats[away].pts += 1; stats[home].d++; stats[away].d++; }
    }

    // Sort: pts → gd → gf → ELO
    const sorted = Object.values(stats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd  !== a.gd)  return b.gd  - a.gd;
      if (b.gf  !== a.gf)  return b.gf  - a.gf;
      return getElo(b.team) - getElo(a.team);
    });

    standings[group] = sorted;
  }

  return { groupResults, standings };
}

// ── 2. Best 8 Third-Place Teams ───────────────────────────────────────────────

function bestThirdPlace(standings) {
  const thirds = GROUPS.map(g => ({ ...standings[g][2], group: g }));

  // Rank by pts → gd → gf → ELO (same as group tiebreaker)
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd  !== a.gd)  return b.gd  - a.gd;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    return getElo(b.team) - getElo(a.team);
  });

  return thirds.slice(0, 8);
}

// ── 3. Round of 32 bracket structure ─────────────────────────────────────────
//
// 24 group qualifiers (1st + 2nd × 12 groups) + 8 best 3rd-place = 32 teams.
//
// Bracket layout — 16 R32 matches:
//   Matches  1-12 : cross-pair group winner vs runner-up from adjacent group
//   Matches 13-16 : 8 best third-place teams play each other (seeded 1v8, 2v7, 3v6, 4v5)
//
// R16 pairing (winners of R32):
//   R16-1 : R32-1  vs R32-13
//   R16-2 : R32-2  vs R32-14
//   R16-3 : R32-3  vs R32-15
//   R16-4 : R32-4  vs R32-16
//   R16-5 : R32-5  vs R32-9
//   R16-6 : R32-6  vs R32-10
//   R16-7 : R32-7  vs R32-11
//   R16-8 : R32-8  vs R32-12
//
// QF: QF-1: R16-1 vs R16-2 | QF-2: R16-3 vs R16-4
//     QF-3: R16-5 vs R16-6 | QF-4: R16-7 vs R16-8
//
// SF: SF-1: QF-1 vs QF-2 | SF-2: QF-3 vs QF-4
// Final: SF-1 vs SF-2

function buildR32Slots(standings, thirds) {
  // Helper: get team at group position (0=1st, 1=2nd, 2=3rd)
  const pos = (group, idx) => standings[group][idx].team;

  // 12 cross-pairs: 1X vs 2(adjacent group)
  // Group pairs: A↔B, C↔D, E↔F, G↔H, I↔J, K↔L
  const pairs = [["A","B"],["C","D"],["E","F"],["G","H"],["I","J"],["K","L"]];

  const r32 = [];
  for (const [g1, g2] of pairs) {
    r32.push({ home: pos(g1,0), away: pos(g2,1) });  // 1G1 vs 2G2
    r32.push({ home: pos(g2,0), away: pos(g1,1) });  // 1G2 vs 2G1
  }

  // 4 matches among 8 best 3rd-place teams (seeded: 1v8, 2v7, 3v6, 4v5)
  const t = thirds.map(x => x.team);
  r32.push({ home: t[0], away: t[7] });
  r32.push({ home: t[1], away: t[6] });
  r32.push({ home: t[2], away: t[5] });
  r32.push({ home: t[3], away: t[4] });

  return r32; // 16 slots
}

// ── 4. Full Knockout Simulation ───────────────────────────────────────────────

function simulateKnockout(r32Slots) {
  // Play all 16 R32 matches
  const r32Results = r32Slots.map(({ home, away }) => knockoutWinner(home, away));

  // R16 pairings (by R32 match indices, 0-based)
  const r16Pairs = [
    [0,12],[1,13],[2,14],[3,15],   // zone A (groups A-D + 3rds)
    [4,8],[5,9],[6,10],[7,11],     // zone B (groups E-L)
  ];
  const r16Results = r16Pairs.map(([i, j]) =>
    knockoutWinner(r32Results[i].winner, r32Results[j].winner)
  );

  // QF
  const qfPairs = [[0,1],[2,3],[4,5],[6,7]];
  const qfResults = qfPairs.map(([i, j]) =>
    knockoutWinner(r16Results[i].winner, r16Results[j].winner)
  );

  // SF
  const sfResults = [
    knockoutWinner(qfResults[0].winner, qfResults[1].winner),
    knockoutWinner(qfResults[2].winner, qfResults[3].winner),
  ];

  // Final
  const finalResult = knockoutWinner(sfResults[0].winner, sfResults[1].winner);

  // 3rd place
  const thirdPlace = knockoutWinner(sfResults[0].loser, sfResults[1].loser);

  return { r32Results, r16Results, qfResults, sfResults, finalResult, thirdPlace };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function simulateTournament() {
  const { standings }  = simulateGroupStage();
  const thirds         = bestThirdPlace(standings);
  const r32Slots       = buildR32Slots(standings, thirds);
  const knockout       = simulateKnockout(r32Slots);

  return { standings, thirds, r32Slots, ...knockout };
}
