/**
 * TournamentSimulator.js
 *
 * Simulates the full FIFA World Cup 2026 tournament:
 *   1. Group stage  — predict all 72 matches, compute standings
 *   2. Best-8 third — rank the 12 third-placed teams, pick top 8
 *   3. Round of 32  — 16 matches using predefined bracket structure
 *   4. R16 → QF → SF → Final — single-elimination until champion
 *
 * All simulation (group stage, knockout, Monte Carlo) uses the same stochastic
 * Poisson engine so results are internally consistent.
 *
 * Exports:
 *   simulateTournament()         — single full-tournament run (Poisson-sampled)
 *   simulateMatchMonteCarlo()    — per-match empirical outcome distribution
 *   runMonteCarlo(n)             — n full-tournament runs → stage probabilities
 */

import { getAdjustedGoalRates, predictMatch, predictScore } from "./Predictions";
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
  const neutralSite = stage === "knockout";
  const pred = predictMatch(
    getElo(home), getElo(away),
    getApiForm(home), getApiForm(away),
    getHist(home)?.competitive,
    getHist(away)?.competitive,
    null,        // h2h — not pre-computed for simulator
    fixtureId,   // Polymarket fixture ID (group stage only)
    { neutralSite, homeTeam: home, awayTeam: away },
  );
  const homeWinProb = pred.homeWin / 100;
  const score = predictScore(
    getHist(home)?.competitive,
    getHist(away)?.competitive,
    homeWinProb,
    { stage, eloHome: getElo(home), eloAway: getElo(away), homeTeam: home, awayTeam: away },
  );
  return { homeWinProb, awayWinProb: pred.awayWin / 100, score };
}

/** Deterministic knockout winner — uses best-guess score, higher ELO breaks ties. */
function knockoutWinner(home, away) {
  const { homeWinProb, score } = simulateMatch(home, away, null, "knockout");
  const homeWins = homeWinProb > 0.5
    ? true
    : homeWinProb === 0.5
      ? getElo(home) >= getElo(away)
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

// ── Stochastic helpers (Monte Carlo) ─────────────────────────────────────────

/**
 * Sample a Poisson random variable using the Knuth algorithm.
 * Efficient for small lambda values (< ~30), which is always true for soccer xG.
 */
function poissonSample(lambda, rng = Math.random) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Play a match stochastically: sample home/away goals from Poisson(xG).
 * Returns { homeGoals, awayGoals, winner, loser }.
 * Draws in knockout context are resolved by a penalty shootout coin-flip
 * weighted by the model's win probability.
 */
function stochasticMatch(home, away, knockout = false, fixtureId = null, rng = Math.random) {
  const pred = predictMatch(
    getElo(home), getElo(away),
    getApiForm(home), getApiForm(away),
    getHist(home)?.competitive,
    getHist(away)?.competitive,
    null,
    fixtureId,
    { neutralSite: knockout, homeTeam: home, awayTeam: away },
  );
  const homeWinProb = pred.homeWin / 100;

  const ratesH = getAdjustedGoalRates(getHist(home)?.competitive, getElo(home), getApiForm(home));
  const ratesA = getAdjustedGoalRates(getHist(away)?.competitive, getElo(away), getApiForm(away));
  const BASE  = 1.35;
  const atkH  = ratesH.avgGoalsFor;
  const defH  = ratesH.avgGoalsAgainst;
  const atkA  = ratesA.avgGoalsFor;
  const defA  = ratesA.avgGoalsAgainst;

  const bias = (homeWinProb - 0.5) * 0.9;
  const xGHome = Math.max(0.3, Math.min(4.5, atkH * (defA + BASE) / (2 * BASE) + bias));
  const xGAway = Math.max(0.3, Math.min(4.5, atkA * (defH + BASE) / (2 * BASE) - bias));

  const homeGoals = poissonSample(xGHome, rng);
  const awayGoals = poissonSample(xGAway, rng);

  let winner, loser;
  if (homeGoals > awayGoals) {
    winner = home; loser = away;
  } else if (awayGoals > homeGoals) {
    winner = away; loser = home;
  } else if (knockout) {
    // Drawn knockout — simulate penalty shootout using model win probability
    winner = rng() < homeWinProb ? home : away;
    loser  = winner === home ? away : home;
  } else {
    winner = null; loser = null; // draw in group stage
  }

  return { homeGoals, awayGoals, winner, loser, home, away };
}

// ── 1. Group Stage ────────────────────────────────────────────────────────────

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

function simulateGroupStage() {
  const groupResults = {}; // group → array of { home, away, homeGoals, awayGoals }

  for (const fixture of fixtures) {
    const { id, group, home, away } = fixture;
    const prediction = simulateMatchMonteCarlo(home, away, id);
    const { score } = prediction;
    if (!groupResults[group]) groupResults[group] = [];
    groupResults[group].push({
      home,
      away,
      homeGoals: score.home,
      awayGoals: score.away,
      homeWinProb: prediction.homeWin / 100,
    });
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
// Official FIFA 2026 R32 seeding (M73–M88), mirroring MyBracket.jsx exactly.
//
// R16 pairings (winners of R32):
//   R16-0: R32-1  vs R32-4   R16-4: R32-10 vs R32-11
//   R16-1: R32-0  vs R32-2   R16-5: R32-8  vs R32-9
//   R16-2: R32-3  vs R32-5   R16-6: R32-13 vs R32-15
//   R16-3: R32-6  vs R32-7   R16-7: R32-12 vs R32-14
//
// QF: QF-0: R16-0 vs R16-1 | QF-1: R16-4 vs R16-5
//     QF-2: R16-2 vs R16-3 | QF-3: R16-6 vs R16-7
//
// SF: SF-0: QF-0 vs QF-1 | SF-1: QF-2 vs QF-3
// Final: SF-0 vs SF-1

// 3rd-place slots: R32 index → eligible source groups (official FIFA constraint)
const THIRD_SLOTS = [
  [1,  new Set(['A','B','C','D','F'])],
  [4,  new Set(['C','D','F','G','H'])],
  [6,  new Set(['C','E','F','H','I'])],
  [7,  new Set(['E','H','I','J','K'])],
  [8,  new Set(['B','E','F','I','J'])],
  [9,  new Set(['A','E','H','I','J'])],
  [12, new Set(['E','F','G','I','J'])],
  [14, new Set(['D','E','I','J','L'])],
];

// Assign 8 qualifying 3rd-place teams to their official bracket slots via backtracking.
function assign3rdPlace(thirds) {
  const ordered = [...THIRD_SLOTS]
    .map(([idx, eligible]) => ({ idx, eligible, count: thirds.filter(t => t.team && eligible.has(t.group)).length }))
    .sort((a, b) => a.count - b.count);

  const result = {};
  const used = new Set();

  function bt(i) {
    if (i === ordered.length) return true;
    const { idx, eligible } = ordered[i];
    for (const t of thirds) {
      if (t.team && !used.has(t.group) && eligible.has(t.group)) {
        result[idx] = t.team;
        used.add(t.group);
        if (bt(i + 1)) return true;
        delete result[idx];
        used.delete(t.group);
      }
    }
    return false;
  }

  bt(0);
  return result; // { slotIdx: team }
}

function buildR32Slots(standings, thirds) {
  const pos = (group, idx) => standings[group][idx].team;

  // Official R32 matchups (M73–M88)
  const slots = [
    { home: pos('A',1), away: pos('B',1) },  // 0  M73: 2A vs 2B
    { home: pos('E',0), away: null        },  // 1  M74: 1E vs 3rd(A/B/C/D/F)
    { home: pos('F',0), away: pos('C',1)  },  // 2  M75: 1F vs 2C
    { home: pos('C',0), away: pos('F',1)  },  // 3  M76: 1C vs 2F
    { home: pos('I',0), away: null        },  // 4  M77: 1I vs 3rd(C/D/F/G/H)
    { home: pos('E',1), away: pos('I',1)  },  // 5  M78: 2E vs 2I
    { home: pos('A',0), away: null        },  // 6  M79: 1A vs 3rd(C/E/F/H/I)
    { home: pos('L',0), away: null        },  // 7  M80: 1L vs 3rd(E/H/I/J/K)
    { home: pos('D',0), away: null        },  // 8  M81: 1D vs 3rd(B/E/F/I/J)
    { home: pos('G',0), away: null        },  // 9  M82: 1G vs 3rd(A/E/H/I/J)
    { home: pos('K',1), away: pos('L',1)  },  // 10 M83: 2K vs 2L
    { home: pos('H',0), away: pos('J',1)  },  // 11 M84: 1H vs 2J
    { home: pos('B',0), away: null        },  // 12 M85: 1B vs 3rd(E/F/G/I/J)
    { home: pos('J',0), away: pos('H',1)  },  // 13 M86: 1J vs 2H
    { home: pos('K',0), away: null        },  // 14 M87: 1K vs 3rd(D/E/I/J/L)
    { home: pos('D',1), away: pos('G',1)  },  // 15 M88: 2D vs 2G
  ];

  const assignments = assign3rdPlace(thirds);
  for (const [idx] of THIRD_SLOTS) {
    if (assignments[idx]) slots[idx].away = assignments[idx];
  }

  return slots;
}

// ── 4. Full Knockout Simulation ───────────────────────────────────────────────

function simulateKnockout(r32Slots) {
  // Play all 16 R32 matches
  const r32Results = r32Slots.map(({ home, away }) => knockoutWinner(home, away));

  // R16 pairings — official FIFA bracket (matches MATCH_SOURCES in MyBracket.jsx)
  const r16Pairs = [
    [1,4],[0,2],[3,5],[6,7],       // M89–M92
    [10,11],[8,9],[13,15],[12,14], // M93–M96
  ];
  const r16Results = r16Pairs.map(([i, j]) =>
    knockoutWinner(r32Results[i].winner, r32Results[j].winner)
  );

  // QF — official FIFA bracket
  const qfPairs = [[0,1],[4,5],[2,3],[6,7]];
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

// ── Monte Carlo ───────────────────────────────────────────────────────────────

function stochasticGroupStage() {
  const groupResults = {};

  for (const fixture of fixtures) {
    const { id, group, home, away } = fixture;
    const result = stochasticMatch(home, away, false, id);
    if (!groupResults[group]) groupResults[group] = [];
    groupResults[group].push(result);
  }

  const standings = {};
  for (const group of GROUPS) {
    const matches = groupResults[group] || [];
    const stats   = {};

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

    standings[group] = Object.values(stats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd  !== a.gd)  return b.gd  - a.gd;
      if (b.gf  !== a.gf)  return b.gf  - a.gf;
      return getElo(b.team) - getElo(a.team);
    });
  }

  return standings;
}

function stochasticKnockout(r32Slots) {
  const r32Results = r32Slots.map(({ home, away }) => stochasticMatch(home, away, true));

  const r16Pairs = [[1,4],[0,2],[3,5],[6,7],[10,11],[8,9],[13,15],[12,14]];
  const r16Results = r16Pairs.map(([i, j]) =>
    stochasticMatch(r32Results[i].winner, r32Results[j].winner, true)
  );

  const qfPairs = [[0,1],[4,5],[2,3],[6,7]];
  const qfResults = qfPairs.map(([i, j]) =>
    stochasticMatch(r16Results[i].winner, r16Results[j].winner, true)
  );

  const sfResults = [
    stochasticMatch(qfResults[0].winner, qfResults[1].winner, true),
    stochasticMatch(qfResults[2].winner, qfResults[3].winner, true),
  ];

  const finalResult = stochasticMatch(sfResults[0].winner, sfResults[1].winner, true);

  return {
    r32: r32Results.map(r => r.winner),
    r16: r16Results.map(r => r.winner),
    qf:  qfResults.map(r => r.winner),
    sf:  sfResults.map(r => r.winner),
    finalist: [sfResults[0].winner, sfResults[1].winner],
    champion: finalResult.winner,
  };
}

/**
 * Run n Monte Carlo simulations of the full tournament.
 *
 * @param {number} n  Number of simulations (default 10 000)
 * @returns {{
 *   groupStage:  Record<team, number>,   // % chance of advancing from group
 *   roundOf32:   Record<team, number>,
 *   roundOf16:   Record<team, number>,
 *   quarterFinal:Record<team, number>,
 *   semiFinal:   Record<team, number>,
 *   finalist:    Record<team, number>,
 *   champion:    Record<team, number>,
 *   simulations: number,
 * }}
 */
/**
 * Run n stochastic simulations of a single match and return empirical outcome
 * probabilities + the most common scorelines.
 *
 * Unlike predictMatch() which gives a point-estimate, this reflects the full
 * distribution of outcomes from Poisson goal sampling — including real draw
 * probabilities (not absorbed into win%).
 *
 * @param {string}      home
 * @param {string}      away
 * @param {string|null} fixtureId  Polymarket fixture ID, if available
 * @param {number}      n          Simulations (default 2 000 — fast, ~2ms per card)
 */
export function simulateMatchMonteCarlo(home, away, fixtureId = null, n = 2000) {
  let homeWins = 0, draws = 0, awayWins = 0;
  const scoreCounts = {};
  const rng = seededRng(`${fixtureId ?? "friendly"}|${home}|${away}|${n}`);

  for (let i = 0; i < n; i++) {
    const { homeGoals, awayGoals } = stochasticMatch(home, away, false, fixtureId, rng);
    const key = `${homeGoals}-${awayGoals}`;
    scoreCounts[key] = (scoreCounts[key] ?? 0) + 1;
    if      (homeGoals > awayGoals) homeWins++;
    else if (awayGoals > homeGoals) awayWins++;
    else                            draws++;
  }

  const topScores = Object.entries(scoreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([score, count]) => ({ score, pct: +((count / n) * 100).toFixed(1) }));

  // Also compute xG averages for display
  const ratesH = getAdjustedGoalRates(getHist(home)?.competitive, getElo(home), getApiForm(home));
  const ratesA = getAdjustedGoalRates(getHist(away)?.competitive, getElo(away), getApiForm(away));
  const BASE  = 1.35;
  const pred = predictMatch(
    getElo(home), getElo(away),
    getApiForm(home), getApiForm(away),
    getHist(home)?.competitive,
    getHist(away)?.competitive,
    null,
    fixtureId,
    { neutralSite: false, homeTeam: home, awayTeam: away },
  );
  const bias = (pred.homeWin / 100 - 0.5) * 0.9;
  const xGHome = +Math.max(0.3, Math.min(4.5,
    ratesH.avgGoalsFor * (ratesA.avgGoalsAgainst + BASE) / (2 * BASE) + bias
  )).toFixed(2);
  const xGAway = +Math.max(0.3, Math.min(4.5,
    ratesA.avgGoalsFor * (ratesH.avgGoalsAgainst + BASE) / (2 * BASE) - bias
  )).toFixed(2);

  const [bestScore] = topScores;
  const [bh, ba]    = bestScore ? bestScore.score.split("-").map(Number) : [1, 1];

  return {
    homeWin:    +((homeWins / n) * 100).toFixed(1),
    draw:       +((draws    / n) * 100).toFixed(1),
    awayWin:    +((awayWins / n) * 100).toFixed(1),
    score:      { home: bh, away: ba, xGHome, xGAway, alternatives: topScores.slice(1).map(s => s.score.replace("-", "–")) },
    topScores,
    simulations: n,
  };
}

export function runMonteCarlo(n = 10000) {
  const counts = {
    groupStage:   {},
    roundOf32:    {},
    roundOf16:    {},
    quarterFinal: {},
    semiFinal:    {},
    finalist:     {},
    champion:     {},
  };

  const inc = (stage, team) => {
    counts[stage][team] = (counts[stage][team] ?? 0) + 1;
  };

  for (let i = 0; i < n; i++) {
    const standings = stochasticGroupStage();

    // Collect group qualifiers (top 2 per group + best 8 thirds)
    const thirds = bestThirdPlace(standings);
    const top8ThirdTeams = new Set(thirds.map(t => t.team));

    for (const group of GROUPS) {
      const sorted = standings[group];
      inc("groupStage", sorted[0].team);
      inc("groupStage", sorted[1].team);
      if (top8ThirdTeams.has(sorted[2].team)) {
        inc("groupStage", sorted[2].team);
      }
    }

    const r32Slots = buildR32Slots(standings, thirds);
    const ko = stochasticKnockout(r32Slots);

    ko.r32.forEach(t      => inc("roundOf32",    t));
    ko.r16.forEach(t      => inc("roundOf16",    t));
    ko.qf.forEach(t       => inc("quarterFinal", t));
    ko.sf.forEach(t       => inc("semiFinal",    t));
    ko.finalist.forEach(t => inc("finalist",     t));
    inc("champion", ko.champion);
  }

  // Convert raw counts to percentages
  const toPercent = (obj) => {
    const result = {};
    for (const [team, count] of Object.entries(obj)) {
      result[team] = +((count / n) * 100).toFixed(1);
    }
    return result;
  };

  return {
    groupStage:   toPercent(counts.groupStage),
    roundOf32:    toPercent(counts.roundOf32),
    roundOf16:    toPercent(counts.roundOf16),
    quarterFinal: toPercent(counts.quarterFinal),
    semiFinal:    toPercent(counts.semiFinal),
    finalist:     toPercent(counts.finalist),
    champion:     toPercent(counts.champion),
    simulations:  n,
  };
}
