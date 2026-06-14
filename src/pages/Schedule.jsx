import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { buildResultsMap } from "../utils/scoring";
import { getFlagClass } from "../utils/flags";
import PostMatchBreakdown from "../components/PostMatchBreakdown";
import LiveMatchPanel from "../components/LiveMatchPanel";
import fixtures from "../data/wc2026_fixtures.json";
import eloRatings from "../data/elo_ratings.json";

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const GROUP_MATCHES = fixtures.filter(m => m.group);
const getElo = t => eloRatings[t] ?? 1400;

function parseFixtureDate(dateStr, timeStr) {
  const clean = timeStr.replace(" ET", "").trim();
  const [time, meridiem] = clean.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 4, m)); // EDT = UTC-4
}

function fmtTime(kickoff) {
  return kickoff.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
}

function fmtDateHeading(dateStr) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtShortDate(dateStr) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Group standings (real results) ────────────────────────────────────────────

function computeGroupStandings(groupMatches, resultsMap) {
  const stats = {};
  [...new Set(groupMatches.flatMap(m => [m.home, m.away]))]
    .forEach(t => { stats[t] = { team: t, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });

  for (const m of groupMatches) {
    const r = resultsMap[m.id];
    if (r == null || r.home_score == null) continue;
    const hs = Number(r.home_score), as_ = Number(r.away_score);
    stats[m.home].gp++; stats[m.away].gp++;
    stats[m.home].gf += hs; stats[m.home].ga += as_;
    stats[m.away].gf += as_; stats[m.away].ga += hs;
    if (hs > as_) {
      stats[m.home].w++; stats[m.home].pts += 3; stats[m.away].l++;
    } else if (as_ > hs) {
      stats[m.away].w++; stats[m.away].pts += 3; stats[m.home].l++;
    } else {
      stats[m.home].d++; stats[m.home].pts++;
      stats[m.away].d++; stats[m.away].pts++;
    }
  }

  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return getElo(b.team) - getElo(a.team);
  });
}

// ── Knockout bracket data ─────────────────────────────────────────────────────

const ROUND_LABELS = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-Finals", SF: "Semi-Finals", F: "Final" };
const ROUND_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 };
const ROUNDS = ["R32", "R16", "QF", "SF", "F"];

const R32_LABELS = [
  "2A vs 2B", "1E vs 3rd", "1F vs 2C", "1C vs 2F",
  "1I vs 3rd", "2E vs 2I", "1A vs 3rd", "1L vs 3rd",
  "1D vs 3rd", "1G vs 3rd", "2K vs 2L", "1H vs 2J",
  "1B vs 3rd", "1J vs 2H", "1K vs 3rd", "2D vs 2G",
];

const KO_MATCH_SOURCES = {
  R16: [
    ["R32",1,"R32",4], ["R32",0,"R32",2], ["R32",3,"R32",5], ["R32",6,"R32",7],
    ["R32",10,"R32",11],["R32",8,"R32",9], ["R32",13,"R32",15],["R32",12,"R32",14],
  ],
  QF: [
    ["R16",0,"R16",1], ["R16",4,"R16",5], ["R16",2,"R16",3], ["R16",6,"R16",7],
  ],
  SF: [ ["QF",0,"QF",1], ["QF",2,"QF",3] ],
  F:  [ ["SF",0,"SF",1] ],
};

const KO_WINNER_DEST = {
  R32: [["R16",1],["R16",0],["R16",1],["R16",2],["R16",0],["R16",2],["R16",3],["R16",3],
        ["R16",5],["R16",5],["R16",4],["R16",4],["R16",7],["R16",6],["R16",7],["R16",6]],
  R16: [["QF",0],["QF",0],["QF",2],["QF",2],["QF",1],["QF",1],["QF",3],["QF",3]],
  QF:  [["SF",0],["SF",0],["SF",1],["SF",1]],
  SF:  [["F",0],["F",0]],
};

const KO_THIRD_SLOTS = [
  [1,  new Set(["A","B","C","D","F"])],
  [4,  new Set(["C","D","F","G","H"])],
  [6,  new Set(["C","E","F","H","I"])],
  [7,  new Set(["E","H","I","J","K"])],
  [8,  new Set(["B","E","F","I","J"])],
  [9,  new Set(["A","E","H","I","J"])],
  [12, new Set(["E","F","G","I","J"])],
  [14, new Set(["D","E","I","J","L"])],
];

// Official FIFA 2026 knockout schedule
const KO_SCHEDULE = [
  // R32 — M73–M88 (official dates June 28 – July 3; times converted to ET)
  { id:"M73",  round:"R32", idx:0,  date:"2026-06-28", time:"3:00 PM ET" },
  { id:"M74",  round:"R32", idx:1,  date:"2026-06-29", time:"4:30 PM ET" },
  { id:"M75",  round:"R32", idx:2,  date:"2026-06-29", time:"9:00 PM ET" },
  { id:"M76",  round:"R32", idx:3,  date:"2026-06-29", time:"12:00 PM ET" },
  { id:"M77",  round:"R32", idx:4,  date:"2026-06-30", time:"5:00 PM ET" },
  { id:"M78",  round:"R32", idx:5,  date:"2026-06-30", time:"1:00 PM ET" },
  { id:"M79",  round:"R32", idx:6,  date:"2026-06-30", time:"9:00 PM ET" },
  { id:"M80",  round:"R32", idx:7,  date:"2026-07-01", time:"12:00 PM ET" },
  { id:"M81",  round:"R32", idx:8,  date:"2026-07-01", time:"8:00 PM ET" },
  { id:"M82",  round:"R32", idx:9,  date:"2026-07-01", time:"4:00 PM ET" },
  { id:"M83",  round:"R32", idx:10, date:"2026-07-02", time:"7:00 PM ET" },
  { id:"M84",  round:"R32", idx:11, date:"2026-07-02", time:"3:00 PM ET" },
  { id:"M85",  round:"R32", idx:12, date:"2026-07-02", time:"11:00 PM ET" },
  { id:"M86",  round:"R32", idx:13, date:"2026-07-03", time:"6:00 PM ET" },
  { id:"M87",  round:"R32", idx:14, date:"2026-07-03", time:"8:30 PM ET" },
  { id:"M88",  round:"R32", idx:15, date:"2026-07-03", time:"1:00 PM ET" },
  // R16 — M89–M96 (official dates July 4 – 7)
  { id:"M89",  round:"R16", idx:0,  date:"2026-07-04", time:"5:00 PM ET" },
  { id:"M90",  round:"R16", idx:1,  date:"2026-07-04", time:"12:00 PM ET" },
  { id:"M91",  round:"R16", idx:2,  date:"2026-07-05", time:"4:00 PM ET" },
  { id:"M92",  round:"R16", idx:3,  date:"2026-07-05", time:"8:00 PM ET" },
  { id:"M93",  round:"R16", idx:4,  date:"2026-07-06", time:"2:00 PM ET" },
  { id:"M94",  round:"R16", idx:5,  date:"2026-07-06", time:"8:00 PM ET" },
  { id:"M95",  round:"R16", idx:6,  date:"2026-07-07", time:"12:00 PM ET" },
  { id:"M96",  round:"R16", idx:7,  date:"2026-07-07", time:"4:00 PM ET" },
  // QF — M97–M100 (official dates July 9 – 11)
  { id:"M97",  round:"QF",  idx:0,  date:"2026-07-09", time:"4:00 PM ET" },
  { id:"M98",  round:"QF",  idx:1,  date:"2026-07-10", time:"3:00 PM ET" },
  { id:"M99",  round:"QF",  idx:2,  date:"2026-07-11", time:"5:00 PM ET" },
  { id:"M100", round:"QF",  idx:3,  date:"2026-07-11", time:"8:00 PM ET" },
  // SF — M101–M102 (official dates July 14 – 15)
  { id:"M101", round:"SF",  idx:0,  date:"2026-07-14", time:"2:00 PM ET" },
  { id:"M102", round:"SF",  idx:1,  date:"2026-07-15", time:"3:00 PM ET" },
  // Final — M104 at MetLife, East Rutherford (M103 3rd-place play-off July 18, untracked)
  { id:"M104", round:"F",   idx:0,  date:"2026-07-19", time:"3:00 PM ET" },
];

const KO_SCHEDULE_BY_ID = Object.fromEntries(KO_SCHEDULE.map(m => [m.id, m]));
// lookup by round+idx → schedule entry
const KO_BY_ROUND_IDX = {};
for (const m of KO_SCHEDULE) {
  if (!KO_BY_ROUND_IDX[m.round]) KO_BY_ROUND_IDX[m.round] = {};
  KO_BY_ROUND_IDX[m.round][m.idx] = m;
}

// ── Bracket helpers ───────────────────────────────────────────────────────────

function assign3rdPlace(thirds) {
  const ordered = [...KO_THIRD_SLOTS]
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
  return result;
}

function isGroupFinished(g, resultsMap) {
  return GROUP_MATCHES.filter(m => m.group === g).every(m => resultsMap[m.id]?.home_score != null);
}

function buildLiveR32Slots(byGroup, resultsMap) {
  const pos = (g, i) => isGroupFinished(g, resultsMap) ? (byGroup[g]?.[i]?.team ?? null) : null;

  const slots = [
    { home: pos("A",1), away: pos("B",1) },
    { home: pos("E",0), away: null       },
    { home: pos("F",0), away: pos("C",1) },
    { home: pos("C",0), away: pos("F",1) },
    { home: pos("I",0), away: null       },
    { home: pos("E",1), away: pos("I",1) },
    { home: pos("A",0), away: null       },
    { home: pos("L",0), away: null       },
    { home: pos("D",0), away: null       },
    { home: pos("G",0), away: null       },
    { home: pos("K",1), away: pos("L",1) },
    { home: pos("H",0), away: pos("J",1) },
    { home: pos("B",0), away: null       },
    { home: pos("J",0), away: pos("H",1) },
    { home: pos("K",0), away: null       },
    { home: pos("D",1), away: pos("G",1) },
  ];

  const allFinished = GROUPS.every(g => isGroupFinished(g, resultsMap));
  if (allFinished) {
    const thirds = GROUPS.map(g => ({ group: g, team: byGroup[g]?.[2]?.team ?? null, pts: byGroup[g]?.[2]?.pts ?? 0 }))
      .sort((a, b) => b.pts - a.pts || getElo(b.team) - getElo(a.team)).slice(0, 8);
    const assignments = assign3rdPlace(thirds);
    for (const [idx] of KO_THIRD_SLOTS) {
      if (assignments[idx]) slots[idx].away = assignments[idx];
    }
  }

  return slots;
}

function buildLiveBracket(byGroup, resultsMap, r32Slots) {
  const bw = {
    R32: Array(16).fill(null),
    R16: Array(8).fill(null),
    QF:  Array(4).fill(null),
    SF:  Array(2).fill(null),
    F:   Array(1).fill(null),
  };

  for (let i = 0; i < 16; i++) {
    const r = resultsMap[`M${73 + i}`];
    if (!r || r.home_score == null) continue;
    const slot = r32Slots[i];
    const hs = +r.home_score, as_ = +r.away_score;
    bw.R32[i] = hs > as_ ? slot.home : hs < as_ ? slot.away : null;
  }

  const r16Base = 89;
  for (let i = 0; i < 8; i++) {
    const r = resultsMap[`M${r16Base + i}`];
    if (!r || r.home_score == null) continue;
    const [hr, hi, ar, ai] = KO_MATCH_SOURCES.R16[i];
    const homeTeam = bw[hr][hi], awayTeam = bw[ar][ai];
    const hs = +r.home_score, as_ = +r.away_score;
    bw.R16[i] = hs > as_ ? homeTeam : as_ > hs ? awayTeam : null;
  }

  const qfBase = 97;
  for (let i = 0; i < 4; i++) {
    const r = resultsMap[`M${qfBase + i}`];
    if (!r || r.home_score == null) continue;
    const [hr, hi, ar, ai] = KO_MATCH_SOURCES.QF[i];
    const homeTeam = bw[hr][hi], awayTeam = bw[ar][ai];
    const hs = +r.home_score, as_ = +r.away_score;
    bw.QF[i] = hs > as_ ? homeTeam : as_ > hs ? awayTeam : null;
  }

  for (let i = 0; i < 2; i++) {
    const r = resultsMap[`M${101 + i}`];
    if (!r || r.home_score == null) continue;
    const [hr, hi, ar, ai] = KO_MATCH_SOURCES.SF[i];
    const homeTeam = bw[hr][hi], awayTeam = bw[ar][ai];
    const hs = +r.home_score, as_ = +r.away_score;
    bw.SF[i] = hs > as_ ? homeTeam : as_ > hs ? awayTeam : null;
  }

  const rF = resultsMap["M104"];
  if (rF && rF.home_score != null) {
    const homeTeam = bw.SF[0], awayTeam = bw.SF[1];
    const hs = +rF.home_score, as_ = +rF.away_score;
    bw.F[0] = hs > as_ ? homeTeam : as_ > hs ? awayTeam : null;
  }

  return bw;
}

function getMatchTeams(round, idx, r32Slots, bw) {
  if (round === "R32") {
    const s = r32Slots[idx] ?? {};
    return { home: s.home ?? null, away: s.away ?? null };
  }
  const [hr, hi, ar, ai] = KO_MATCH_SOURCES[round][idx];
  return { home: bw[hr]?.[hi] ?? null, away: bw[ar]?.[ai] ?? null };
}

function getMatchLabel(round, idx) {
  if (round === "R32") return R32_LABELS[idx];
  if (round === "F") return "Final";
  const base = { R16: 89, QF: 97, SF: 101 };
  const [hr, hi, ar, ai] = KO_MATCH_SOURCES[round][idx];
  const hBase = { R32: 73, R16: 89, QF: 97, SF: 101 };
  return `W${hBase[hr] + hi} vs W${hBase[ar] + ai}`;
}

// ── Knockout bracket component ────────────────────────────────────────────────

const BRACKET_H = 900;

function TeamSlot({ team, label, isWinner, isLoser, isTop }) {
  const hasTeam = !!team;
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5"
      style={{
        borderRadius: isTop ? "8px 8px 0 0" : "0 0 8px 8px",
        background: isWinner
          ? "rgba(200,240,0,0.12)"
          : isLoser
          ? "rgba(255,255,255,0.02)"
          : hasTeam
          ? "rgba(255,255,255,0.05)"
          : "rgba(255,255,255,0.02)",
        borderBottom: isTop ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}
    >
      {hasTeam ? (
        <>
          <span className={getFlagClass(team) ?? ""} style={{ fontSize: "0.85rem", lineHeight: 1, flexShrink: 0 }} />
          <span className="text-xs font-bold truncate" style={{
            color: isWinner ? "#c8f000" : isLoser ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
            maxWidth: 90,
          }}>
            {team}
          </span>
          {isWinner && <span className="ml-auto text-xs" style={{ color: "#c8f000", flexShrink: 0 }}>✓</span>}
        </>
      ) : (
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
          {label || "TBD"}
        </span>
      )}
    </div>
  );
}

function BracketMatchCard({ round, idx, r32Slots, bw, resultsMap, now }) {
  const sched = KO_BY_ROUND_IDX[round]?.[idx];
  const { home, away } = getMatchTeams(round, idx, r32Slots, bw);
  const label = getMatchLabel(round, idx);
  const matchId = sched?.id;
  const result = matchId ? resultsMap[matchId] : null;
  const hasResult = result?.home_score != null;
  const hasScore = hasResult;
  const hs = hasScore ? +result.home_score : null;
  const as_ = hasScore ? +result.away_score : null;
  const homeWon = hasScore && hs > as_;
  const awayWon = hasScore && as_ > hs;
  const upcoming = sched ? parseFixtureDate(sched.date, sched.time) : null;
  const isLive = upcoming && now >= upcoming && now < new Date(upcoming.getTime() + 120 * 60 * 1000);

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${isLive ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10,
      overflow: "hidden",
      width: 156,
    }}>
      {/* Date line */}
      {sched && (
        <div className="flex items-center justify-between px-2.5 py-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
          <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>
            {fmtShortDate(sched.date)}
          </span>
          {isLive ? (
            <span style={{ fontSize: "0.6rem", fontWeight: 900, color: "#22c55e" }}>LIVE</span>
          ) : hasScore ? (
            <span style={{ fontSize: "0.65rem", fontWeight: 900, color: "#c8f000", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.05em" }}>
              {hs} – {as_}
            </span>
          ) : (
            <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
              {fmtTime(upcoming)}
            </span>
          )}
        </div>
      )}
      {/* Teams */}
      <TeamSlot team={home} label={label?.split(" vs ")[0]} isWinner={homeWon} isLoser={awayWon} isTop={true} />
      <TeamSlot team={away} label={label?.split(" vs ")[1]} isWinner={awayWon} isLoser={homeWon} isTop={false} />
    </div>
  );
}

function KnockoutBracket({ resultsMap, now, r32Slots, bw }) {

  const champion = bw.F[0];

  return (
    <div>
      {champion && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
          style={{ background: "rgba(200,240,0,0.06)", border: "1px solid rgba(200,240,0,0.2)" }}>
          <span className="text-xl">🏆</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "#c8f000" }}>World Champion</p>
            <div className="flex items-center gap-2">
              <span className={getFlagClass(champion) ?? ""} style={{ fontSize: "1.1rem" }} />
              <p className="font-black text-white" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.3rem", letterSpacing: "0.04em" }}>{champion}</p>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex gap-3" style={{ minWidth: "max-content", height: BRACKET_H }}>
          {ROUNDS.map((round, ri) => {
            const count = ROUND_COUNTS[round];
            const slotFlex = Math.pow(2, ri);
            return (
              <div key={round} style={{ width: 164, display: "flex", flexDirection: "column" }}>
                {/* Round header */}
                <div className="mb-2 text-center shrink-0">
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", color: "#c8f000", opacity: 0.7, textTransform: "uppercase" }}>
                    {ROUND_LABELS[round]}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  {Array.from({ length: count }, (_, i) => (
                    <div key={i} style={{ flex: slotFlex, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                      {round === "R32" && (
                        <span style={{ fontSize: "0.5rem", fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>
                          M{73 + i}
                        </span>
                      )}
                      <BracketMatchCard
                        round={round} idx={i}
                        r32Slots={r32Slots} bw={bw}
                        resultsMap={resultsMap} now={now}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
        Teams shown once group stage is complete · Scroll horizontally to see full bracket
      </p>
    </div>
  );
}

// ── Groups tab ────────────────────────────────────────────────────────────────

function GroupStandings({ resultsMap }) {
  const col = { color: "rgba(255,255,255,0.45)", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };
  const cell = { color: "rgba(255,255,255,0.7)", fontSize: "0.75rem", fontWeight: 700, textAlign: "center", minWidth: 28 };

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map(g => {
        const matches = GROUP_MATCHES.filter(m => m.group === g);
        const rows = computeGroupStandings(matches, resultsMap);
        const hasResults = rows.some(r => r.gp > 0);

        return (
          <div key={g} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between px-4 py-2.5"
              style={{ background: "rgba(200,240,0,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.1rem", color: "#c8f000", letterSpacing: "0.06em" }}>
                Group {g}
              </span>
              <div className="flex items-center gap-0">
                {["GP","W","D","L","GF","GA","GD","PTS"].map(h => (
                  <span key={h} style={{ ...col, minWidth: 28, textAlign: "center" }}>{h}</span>
                ))}
              </div>
            </div>

            {rows.map((row, i) => {
              const qualified = i < 2;
              const gd = row.gf - row.ga;
              return (
                <div key={row.team}
                  className="flex items-center px-4 py-2.5"
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div className="flex items-center gap-2 shrink-0" style={{ width: 20 }}>
                    <div className="w-1 rounded-full shrink-0" style={{
                      height: 20,
                      background: i === 0 ? "#c8f000" : i === 1 ? "rgba(200,240,0,0.4)" : "rgba(255,255,255,0.07)",
                    }} />
                  </div>
                  <span className="text-xs font-black shrink-0 mr-2" style={{ color: qualified ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", width: 14, textAlign: "center" }}>
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className={getFlagClass(row.team) ?? ""} style={{ fontSize: "1rem", lineHeight: 1, flexShrink: 0 }} />
                    <span className="text-xs font-semibold truncate"
                      style={{ color: qualified ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)" }}>
                      {row.team}
                    </span>
                  </div>
                  <div className="flex items-center gap-0 shrink-0">
                    {[row.gp, row.w, row.d, row.l, row.gf, row.ga,
                      (gd > 0 ? `+${gd}` : gd), null].map((val, ci) => {
                      const isPts = ci === 7;
                      const isGd = ci === 6;
                      const gdVal = row.gf - row.ga;
                      const color = isPts
                        ? (hasResults && row.gp > 0 ? "#c8f000" : "rgba(255,255,255,0.3)")
                        : isGd
                          ? (gdVal > 0 ? "#22c55e" : gdVal < 0 ? "#ef4444" : "rgba(255,255,255,0.4)")
                          : "rgba(255,255,255,0.7)";
                      const display = isPts ? row.pts : val;
                      return (
                        <span key={ci} style={{ ...cell, color, fontWeight: isPts ? 900 : 700 }}>
                          {display}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Match row ─────────────────────────────────────────────────────────────────

function MatchRow({ fixture, result, now, r32Slots, bw, userPick = null, conf = 1, expanded = false, onToggle, live = null, liveEvents = [] }) {
  const kickoff = fixture.kickoff;
  // Real feed status when available, kickoff-window heuristic as fallback
  const isLive = live
    ? live.status === "LIVE" || live.status === "HT"
    : now >= kickoff && now < new Date(kickoff.getTime() + 120 * 60 * 1000);
  const isPlayed = !!result;
  // Finished per the live feed but match_results not yet (re)loaded — show the live score
  const liveFinished = !isPlayed && !isLive && live?.status && live.status !== "NS" && live.home_score != null;
  const hasEvents = liveEvents.some(e => ["Goal", "Card", "Substitution"].includes(e.type));
  // Expandable for: finished group matches (model breakdown) or any match with a live event feed
  const canExpand = (isPlayed && !fixture.isKnockout) || hasEvents;
  const pickRight = userPick != null && result?.result != null && userPick === result.result;

  let homeTeam, awayTeam, rowLabel, homeTbd, awayTbd;

  if (fixture.isKnockout) {
    const teams = getMatchTeams(fixture.round, fixture.roundIdx, r32Slots ?? [], bw ?? {});
    const parts = getMatchLabel(fixture.round, fixture.roundIdx).split(" vs ");
    homeTeam = teams.home ?? parts[0];
    awayTeam = teams.away ?? parts[1];
    homeTbd = !teams.home;
    awayTbd = !teams.away;
    rowLabel = ROUND_LABELS[fixture.round] ?? fixture.round;
  } else {
    homeTeam = fixture.home;
    awayTeam = fixture.away;
    homeTbd = false;
    awayTbd = false;
    rowLabel = `Group ${fixture.group}`;
  }

  const teamColor = (tbd) => isPlayed ? "rgba(255,255,255,0.55)" : tbd ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.9)";

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        background: isLive ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isLive ? "rgba(34,197,94,0.2)" : expanded ? "rgba(200,240,0,0.18)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3${canExpand ? " cursor-pointer hover:bg-white/[0.03] transition-colors" : ""}`}
        onClick={canExpand ? onToggle : undefined}
        title={canExpand ? "Tap for the full breakdown — model vs reality" : undefined}
      >
        <span className="text-xs shrink-0 hidden sm:block" style={{ color: "rgba(255,255,255,0.3)", minWidth: 72 }}>
          {rowLabel}
        </span>

        {/* Home */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-sm font-semibold truncate text-right"
            style={{ color: teamColor(homeTbd), fontStyle: homeTbd ? "italic" : "normal" }}>
            {homeTeam}
          </span>
          {!homeTbd && <span className={getFlagClass(homeTeam) ?? ""} style={{ fontSize: "1.1rem", lineHeight: 1, flexShrink: 0 }} />}
        </div>

        {/* Score / time */}
        <div className="shrink-0 text-center" style={{ minWidth: 64 }}>
          {isPlayed ? (
            <div className="flex flex-col items-center">
              <span className="font-black tabular-nums text-sm" style={{ color: "#c8f000" }}>
                {result.home_score} – {result.away_score}
              </span>
              {userPick != null && !fixture.isKnockout && (
                <span style={{ fontSize: "0.55rem", fontWeight: 900, color: pickRight ? "#22c55e" : "#ef4444" }}>
                  {pickRight ? "✓ your pick" : "✗ your pick"}
                </span>
              )}
            </div>
          ) : isLive ? (
            <div className="flex flex-col items-center gap-0.5">
              {live?.home_score != null && (
                <span className="font-black tabular-nums text-sm" style={{ color: "#22c55e" }}>
                  {live.home_score} – {live.away_score}
                </span>
              )}
              <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                {live?.status === "HT" ? "HT" : live?.minute ? `LIVE ${live.minute}` : "LIVE"}
              </span>
            </div>
          ) : liveFinished ? (
            <span className="font-black tabular-nums text-sm" style={{ color: "#c8f000" }}>
              {live.home_score} – {live.away_score}
            </span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{fmtTime(kickoff)}</span>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {!awayTbd && <span className={getFlagClass(awayTeam) ?? ""} style={{ fontSize: "1.1rem", lineHeight: 1, flexShrink: 0 }} />}
          <span className="text-sm font-semibold truncate"
            style={{ color: teamColor(awayTbd), fontStyle: awayTbd ? "italic" : "normal" }}>
            {awayTeam}
          </span>
        </div>

        {canExpand && (
          <svg className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
            style={{ color: expanded ? "#c8f000" : "rgba(255,255,255,0.25)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {/* Venue line — group matches only */}
      {fixture.venue && (
        <div className="px-4 pb-2 flex items-center gap-1" style={{ marginTop: -4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.02em" }}>
            {fixture.venue}{fixture.city ? ` · ${fixture.city}` : ""}
          </span>
        </div>
      )}

      {/* Expanded: live event timeline + post-match model breakdown */}
      {canExpand && expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {hasEvents && <LiveMatchPanel live={live} events={liveEvents} />}
          {isPlayed && !fixture.isKnockout && (
            <PostMatchBreakdown match={fixture} result={result} userPick={userPick} confidence={conf} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Schedule({ initialMatchCtx = null }) {
  const { user } = useAuth();
  const { liveMatches, liveEvents } = useLiveFeed();
  const [tab, setTab] = useState("schedule");
  const [resultsMap, setResultsMap] = useState({});
  const [now, setNow] = useState(() => new Date());
  const [mySub, setMySub] = useState(null); // { picks, confidence } for breakdown cards
  const [expandedId, setExpandedId] = useState(() => initialMatchCtx?.matchId ?? null);
  const dateRefs = useRef({});
  const matchRefs = useRef({});
  const scrolledRef = useRef(false);

  useEffect(() => {
    supabase.from("match_results").select("*").then(({ data }) => {
      setResultsMap(buildResultsMap(data ?? []));
    });
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (user) {
      supabase.from("submissions").select("picks, confidence").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (!cancelled) setMySub(data ?? null); });
    }
    return () => { cancelled = true; setMySub(null); };
  }, [user]);

  const liveByGroup = useMemo(() => {
    const map = {};
    for (const g of GROUPS) map[g] = computeGroupStandings(GROUP_MATCHES.filter(m => m.group === g), resultsMap);
    return map;
  }, [resultsMap]);

  const liveR32Slots = useMemo(() => buildLiveR32Slots(liveByGroup, resultsMap), [liveByGroup, resultsMap]);
  const liveBw = useMemo(() => buildLiveBracket(liveByGroup, resultsMap, liveR32Slots), [liveByGroup, resultsMap, liveR32Slots]);

  const allWithDates = useMemo(() => {
    const groupStage = fixtures.map(f => ({ ...f, kickoff: parseFixtureDate(f.date, f.time) }));
    const knockout = KO_SCHEDULE.map(m => ({
      id: m.id,
      round: m.round,
      roundIdx: m.idx,
      date: m.date,
      time: m.time,
      kickoff: parseFixtureDate(m.date, m.time),
      isKnockout: true,
    }));
    return [...groupStage, ...knockout];
  }, []);

  const grouped = useMemo(() => {
    return allWithDates
      .sort((a, b) => a.kickoff - b.kickoff)
      .reduce((acc, f) => {
        if (!acc[f.date]) acc[f.date] = [];
        acc[f.date].push(f);
        return acc;
      }, {});
  }, [allWithDates]);

  useEffect(() => {
    if (scrolledRef.current || tab !== "schedule") return;
    const matchId = initialMatchCtx?.matchId;
    if (matchId) {
      // Navigate to a specific match: expand it and scroll to it
      setExpandedId(matchId);
      const tryScroll = () => {
        const el = matchRefs.current[matchId];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          scrolledRef.current = true;
        }
      };
      // Give the DOM a tick to render before scrolling
      setTimeout(tryScroll, 80);
      return;
    }
    // Default: scroll to today
    const todayET = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const dates = Object.keys(grouped).sort();
    const target = dates.find(d => d >= todayET);
    if (target && dateRefs.current[target]) {
      dateRefs.current[target].scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledRef.current = true;
    }
  }, [grouped, tab]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Tournament</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
          Schedule & Results
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          {tab === "groups" ? "Live standings · Top 2 qualify + 8 best 3rd-place" : tab === "knockouts" ? "R32 → R16 → QF → SF → Final · ET times" : "All matches · ET times · Tap a finished match to see how the model (and you) did"}
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-2 mb-6 p-1 rounded-xl"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "inline-flex" }}>
        {[{ id: "schedule", label: "Fixtures" }, { id: "groups", label: "Standings" }, { id: "knockouts", label: "Knockouts" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
            style={{
              background: tab === t.id ? "linear-gradient(135deg,#c8f000,#84cc16)" : "transparent",
              color: tab === t.id ? "#1a0533" : "rgba(255,255,255,0.5)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Standings tab */}
      {tab === "groups" && <GroupStandings resultsMap={resultsMap} />}

      {/* Knockouts bracket tab */}
      {tab === "knockouts" && <KnockoutBracket resultsMap={resultsMap} now={now} r32Slots={liveR32Slots} bw={liveBw} byGroup={liveByGroup} />}

      {/* Group stage schedule tab */}
      {tab === "schedule" && (
        <div className="flex flex-col gap-6" style={{ maxWidth: 672 }}>
          {Object.entries(grouped).map(([date, dayFixtures]) => {
            const todayET = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
            const isToday = date === todayET;
            return (
              <div key={date} ref={el => { dateRefs.current[date] = el; }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-black uppercase tracking-widest"
                    style={{ color: isToday ? "#c8f000" : "rgba(255,255,255,0.4)" }}>
                    {isToday ? "Today · " : ""}{fmtDateHeading(date)}
                  </span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {dayFixtures.map(f => (
                    <div key={f.id} ref={el => { matchRefs.current[f.id] = el; }}>
                      <MatchRow fixture={f} result={resultsMap[f.id] ?? null} now={now} r32Slots={liveR32Slots} bw={liveBw}
                        userPick={mySub?.picks?.[f.id] ?? null}
                        conf={mySub?.confidence?.[f.id] ?? 1}
                        expanded={expandedId === f.id}
                        onToggle={() => setExpandedId(prev => prev === f.id ? null : f.id)}
                        live={liveMatches[f.id] ?? null}
                        liveEvents={liveEvents[f.id] ?? []} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
