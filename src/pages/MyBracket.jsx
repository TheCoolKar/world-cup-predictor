/**
 * MyBracket.jsx — full user-driven tournament predictor
 *
 * Phase 1 — Group Stage
 *   Two modes: Winner only (1/X/2) or Predict score (▲▼ pickers)
 *   Live standings update as you go.
 *
 * Phase 2 — Knockout Bracket
 *   R32 seeded from your group picks.
 *   Same two modes apply: click to advance OR enter a score.
 *   Tied knockout scores show a "PENS" row to pick the winner manually.
 *   3rd-place play-off sits below the main bracket.
 *
 *   All picks persist to localStorage across refreshes.
 */

import { useState, useMemo, useEffect, useRef }  from "react";
import fixtures                from "../data/wc2026_fixtures.json";
import eloRatings              from "../data/elo_ratings.json";
import { upsertBracket } from "../utils/storage";
import { buildResultsMap, normalizeConfidence } from "../utils/scoring";
import PowerupsModal from "../components/PowerupsModal";
import { supabase } from "../lib/supabase";
import { useAuth }  from "../hooks/useAuth";
import AuthModal    from "../components/AuthModal";
import { useTeamModal } from "../context/TeamModalContext";
import { getFlagClass } from '../utils/flags';

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUPS        = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const GROUP_MATCHES = fixtures.filter(m => m.group);
const ROUNDS        = ["R32","R16","QF","SF","F"];
const ROUND_LABELS  = {
  R32:"Round of 32", R16:"Round of 16",
  QF:"Quarter-Finals", SF:"Semi-Finals", F:"Final",
};
const ROUND_COUNTS  = { R32:16, R16:8, QF:4, SF:2, F:1 };

// ── Helpers ───────────────────────────────────────────────────────────────────

const getElo = t => eloRatings[t] ?? 1400;
const scoreToResult = (h, a) => h > a ? "home" : a > h ? "away" : "draw";

// ── Group standings ───────────────────────────────────────────────────────────

function computeGroupStandings(groupMatches, picks) {
  const stats = {};
  [...new Set(groupMatches.flatMap(m=>[m.home,m.away]))]
    .forEach(t => { stats[t]={team:t,pts:0,w:0,d:0,l:0,played:0}; });
  for (const m of groupMatches) {
    const pick = picks[m.id];
    if (!pick) continue;
    stats[m.home].played++; stats[m.away].played++;
    if      (pick==="home") { stats[m.home].pts+=3; stats[m.home].w++; stats[m.away].l++; }
    else if (pick==="away") { stats[m.away].pts+=3; stats[m.away].w++; stats[m.home].l++; }
    else                    { stats[m.home].pts++;  stats[m.home].d++; stats[m.away].pts++; stats[m.away].d++; }
  }
  return Object.values(stats).sort((a,b)=>b.pts-a.pts||getElo(b.team)-getElo(a.team));
}

function computeAllStandings(picks) {
  const byGroup={};
  for (const g of GROUPS)
    byGroup[g]=computeGroupStandings(GROUP_MATCHES.filter(m=>m.group===g),picks);
  return byGroup;
}

function computeThirds(byGroup) {
  const pool = GROUPS.map(g=>({...byGroup[g][2],group:g}));
  const out  = pool.sort((a,b)=>b.pts-a.pts||getElo(b.team)-getElo(a.team)).slice(0,8);
  while (out.length<8) out.push({team:null});
  return out;
}

// ── Official FIFA 2026 bracket structure ──────────────────────────────────────

// Human-readable labels for each R32 slot
const R32_LABELS = [
  '2A vs 2B',      // 0  M73
  '1E vs 3rd',     // 1  M74
  '1F vs 2C',      // 2  M75
  '1C vs 2F',      // 3  M76
  '1I vs 3rd',     // 4  M77
  '2E vs 2I',      // 5  M78
  '1A vs 3rd',     // 6  M79
  '1L vs 3rd',     // 7  M80
  '1D vs 3rd',     // 8  M81
  '1G vs 3rd',     // 9  M82
  '2K vs 2L',      // 10 M83
  '1H vs 2J',      // 11 M84
  '1B vs 3rd',     // 12 M85
  '1J vs 2H',      // 13 M86
  '1K vs 3rd',     // 14 M87
  '2D vs 2G',      // 15 M88
];

// Match number offset per round (FIFA official numbering)
const ROUND_BASE = { R32: 73, R16: 89, QF: 97, SF: 101, F: 104 };

function getMatchLabel(round, matchIdx) {
  if (round === 'R32') return R32_LABELS[matchIdx];
  if (round === 'F')   return 'Final';
  const [hr, hi, ar, ai] = MATCH_SOURCES[round][matchIdx];
  return `W${ROUND_BASE[hr] + hi} vs W${ROUND_BASE[ar] + ai}`;
}

// For each round, which two previous-round matches feed each slot (home, away)?
const MATCH_SOURCES = {
  R16: [
    ['R32',1,'R32',4],  ['R32',0,'R32',2],  ['R32',3,'R32',5],  ['R32',6,'R32',7],
    ['R32',10,'R32',11],['R32',8,'R32',9],  ['R32',13,'R32',15],['R32',12,'R32',14],
  ],
  QF: [
    ['R16',0,'R16',1], ['R16',4,'R16',5], ['R16',2,'R16',3], ['R16',6,'R16',7],
  ],
  SF: [ ['QF',0,'QF',1], ['QF',2,'QF',3] ],
  F:  [ ['SF',0,'SF',1] ],
};

// For each round+matchIdx, where does the winner cascade to next?
const WINNER_DEST = {
  R32: [['R16',1],['R16',0],['R16',1],['R16',2],['R16',0],['R16',2],['R16',3],['R16',3],
        ['R16',5],['R16',5],['R16',4],['R16',4],['R16',7],['R16',6],['R16',7],['R16',6]],
  R16: [['QF',0],['QF',0],['QF',2],['QF',2],['QF',1],['QF',1],['QF',3],['QF',3]],
  QF:  [['SF',0],['SF',0],['SF',1],['SF',1]],
  SF:  [['F',0],['F',0]],
};

// 3rd-place slots: R32 index → set of eligible source groups
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

// ── R32 slot builder ──────────────────────────────────────────────────────────

function isGroupComplete(g, picks) {
  return GROUP_MATCHES.filter(m => m.group === g).every(m => picks[m.id] != null);
}

// Assign 8 qualifying 3rd-place teams to their official bracket slots via backtracking.
function assign3rdPlace(thirds) {
  // Sort slots by how many qualifying teams are eligible (most-constrained first)
  const ordered = [...THIRD_SLOTS]
    .map(([idx, eligible]) => ({ idx, eligible, count: thirds.filter(t => t.team && eligible.has(t.group)).length }))
    .sort((a, b) => a.count - b.count);

  const result = {}; // slotIdx → team
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

function buildR32Slots(byGroup, thirds, picks) {
  const pos = (g, i) => isGroupComplete(g, picks) ? (byGroup[g]?.[i]?.team ?? null) : null;

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

  // Populate 3rd-place slots only once all 12 groups are decided
  const allComplete = GROUPS.every(g => isGroupComplete(g, picks));
  if (allComplete) {
    const assignments = assign3rdPlace(thirds);
    for (const [idx] of THIRD_SLOTS) {
      if (assignments[idx]) slots[idx].away = assignments[idx];
    }
  }

  return slots;
}

// ── Bracket state helpers ─────────────────────────────────────────────────────

function emptyWinners() {
  return {
    R32:Array(16).fill(null), R16:Array(8).fill(null),
    QF:Array(4).fill(null),   SF:Array(2).fill(null),
    F:Array(1).fill(null),    "3P":[null],
  };
}

function applyPick(prev, round, matchIdx, team, force=false) {
  const next={};
  for (const k of ROUNDS) next[k]=[...prev[k]];
  next["3P"]=[...prev["3P"]];
  const old = next[round][matchIdx];

  if (!force && team===old) {
    next[round][matchIdx]=null;
  } else {
    if (force && old===team) return prev;
    next[round][matchIdx]=team;
  }

  // Cascade: clear old winner from all later rounds using official bracket tree
  if (old) {
    let cur = [round, matchIdx];
    while (WINNER_DEST[cur[0]]) {
      const [dr, di] = WINNER_DEST[cur[0]][cur[1]];
      if (next[dr]?.[di] === old) { next[dr][di] = null; cur = [dr, di]; } else break;
    }
  }
  return next;
}

function getTeams(round, matchIdx, winners, r32Slots) {
  if (round==="R32") { const s=r32Slots[matchIdx]??{}; return{home:s.home??null,away:s.away??null}; }
  const [hr,hi,ar,ai] = MATCH_SOURCES[round][matchIdx];
  return { home: winners[hr]?.[hi]??null, away: winners[ar]?.[ai]??null };
}

function getSFLoser(sfIdx, bw, r32Slots) {
  const {home,away}=getTeams("SF",sfIdx,bw,r32Slots);
  const winner=bw.SF[sfIdx];
  if (!winner||!home||!away) return null;
  return winner===home ? away : home;
}

// ── Shared UI: score number picker ───────────────────────────────────────────

function ScorePicker({ value, onChange }) {
  const v = value??0;
  const btn = (label, action, hoverColor) => (
    <button
      onClick={action}
      className="w-6 h-5 flex items-center justify-center transition-colors"
      style={{ background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.5)", fontSize:"0.6rem", lineHeight:1 }}
      onMouseEnter={e=>e.currentTarget.style.background=hoverColor}
      onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}
    >{label}</button>
  );
  return (
    <div className="flex flex-col items-center" style={{userSelect:"none"}}>
      {btn("▲", ()=>onChange(Math.min(9,v+1)), "rgba(200,240,0,0.2)")}
      <span className="w-6 text-center font-black"
        style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.25rem",color:"white",background:"rgba(255,255,255,0.05)"}}>
        {v}
      </span>
      {btn("▼", ()=>onChange(Math.max(0,v-1)), "rgba(239,68,68,0.2)")}
    </div>
  );
}

// ── Group stage: match pick row ───────────────────────────────────────────────

function MatchPickRow({ match, pick, score, onPickChange, onScoreChange, mode, result, locked, assumption, onAssume }) {
  const { home, away, matchday } = match;
  const { openTeam } = useTeamModal();
  const hVal = score?.home??0, aVal = score?.away??0;
  const hasScore = score!=null;
  const homeW = mode==="score" ? (hasScore&&hVal>aVal) : pick==="home";
  const awayW = mode==="score" ? (hasScore&&aVal>hVal) : pick==="away";
  const drawV = mode==="score" ? (hasScore&&hVal===aVal) : pick==="draw";
  const resultKnown = result?.result != null;
  const isCorrect = resultKnown && pick === result.result;
  const isWrong = resultKnown && pick != null && pick !== result.result;
  const ResultBadge = resultKnown && pick != null ? (
    <span style={{ width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
      background: isCorrect ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
      color: isCorrect ? "#22c55e" : "#ef4444", fontSize:"0.6rem", fontWeight:900, flexShrink:0 }}>
      {isCorrect ? "✓" : "✗"}
    </span>
  ) : null;

  const nameColor = (win,draw) =>
    win ? "#c8f000" : draw ? "#f59e0b" : "rgba(255,255,255,0.75)";

  const teamNameStyle = (color) => ({color, cursor:"pointer", textDecoration:"underline", textDecorationColor:"transparent", textUnderlineOffset:2});
  const teamHover = e => { e.currentTarget.style.textDecorationColor = "currentColor"; };
  const teamLeave = e => { e.currentTarget.style.textDecorationColor = "transparent"; };

  const VenueLine = match.venue ? (
    <div className="flex items-center gap-1 px-3 pb-1.5" style={{ marginTop: -4 }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
      <span style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.22)", fontWeight: 600, letterSpacing: "0.02em" }}>
        {match.venue}{match.city ? ` · ${match.city}` : ""}
      </span>
    </div>
  ) : null;

  if (mode==="score") {
    return (
      <div>
        <div className="flex items-center gap-1.5 py-2 px-3">
          <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
            <span className="text-xs font-semibold truncate text-right"
              style={teamNameStyle(nameColor(homeW,drawV))}
              onClick={()=>openTeam(home)} onMouseEnter={teamHover} onMouseLeave={teamLeave}>{home}</span>
            <span className={getFlagClass(home) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScorePicker value={hVal} onChange={v=>{onScoreChange(match.id,v,aVal);onPickChange(match.id,scoreToResult(v,aVal));}} />
            <span className="font-black text-sm" style={{color:"rgba(255,255,255,0.55)"}}>–</span>
            <ScorePicker value={aVal} onChange={v=>{onScoreChange(match.id,hVal,v);onPickChange(match.id,scoreToResult(hVal,v));}} />
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className={getFlagClass(away) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
            <span className="text-xs font-semibold truncate"
              style={teamNameStyle(nameColor(awayW,drawV))}
              onClick={()=>openTeam(away)} onMouseEnter={teamHover} onMouseLeave={teamLeave}>{away}</span>
          </div>
          <span style={{color:"rgba(255,255,255,0.18)",fontSize:"0.6rem",flexShrink:0}}>MD{matchday}</span>
          {ResultBadge}
        </div>
        {VenueLine}
      </div>
    );
  }

  const pickLabel = pick === "home" ? "H" : pick === "away" ? "A" : pick === "draw" ? "X" : null;
  const pickColor = pick === "home" ? "#c8f000" : pick === "away" ? "#ef4444" : pick === "draw" ? "#f59e0b" : null;

  if (locked) {
    // Match was locked before the user picked it and no result is in yet: offer an
    // "assumed outcome" so late joiners can still resolve their bracket. Worth 0 pts;
    // replaced by the real result once it lands.
    const canAssume = !resultKnown && pick == null && typeof onAssume === "function";
    const ABTN = ({ value, label, color }) => (
      <button onClick={()=>onAssume(match.id, value)}
        className="w-8 h-7 rounded font-black text-xs transition-all duration-100 active:scale-95 shrink-0"
        style={{background:assumption===value?`${color}22`:"rgba(255,255,255,0.04)",
          color:assumption===value?color:"rgba(255,255,255,0.35)",
          border:`1px dashed ${assumption===value?`${color}88`:"rgba(255,255,255,0.18)"}`}}>
        {label}
      </button>
    );
    const homeHL = canAssume ? assumption === "home" : homeW;
    const awayHL = canAssume ? assumption === "away" : awayW;
    return (
      <div style={{ opacity: 0.85 }}>
        <div className="flex items-center gap-2 py-1.5 px-3">
          <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
            <span className="text-xs font-semibold truncate text-right"
              style={{ color: homeHL ? "#c8f000" : "rgba(255,255,255,0.6)" }}>{home}</span>
            <span className={getFlagClass(home) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canAssume ? (
              <>
                <ABTN value="home" label="H" color="#c8f000" />
                <ABTN value="draw" label="X" color="#f59e0b" />
                <ABTN value="away" label="A" color="#ef4444" />
              </>
            ) : pickLabel ? (
              <span className="w-8 h-7 rounded font-black text-xs flex items-center justify-center shrink-0"
                style={{ background: `${pickColor}22`, color: pickColor, border: `1px solid ${pickColor}55` }}>
                {pickLabel}
              </span>
            ) : (
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
            )}
            <span style={{ fontSize: "0.75rem" }}>🔒</span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={getFlagClass(away) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
            <span className="text-xs font-semibold truncate"
              style={{ color: awayHL ? "#ef4444" : "rgba(255,255,255,0.6)" }}>{away}</span>
          </div>
          <span style={{color:"rgba(255,255,255,0.18)",fontSize:"0.6rem",flexShrink:0}}>MD{matchday}</span>
          {ResultBadge}
        </div>
        {canAssume && (
          <div className="px-3 pb-1.5" style={{ marginTop: -2 }}>
            <span style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
              Kicked off before you picked — choose an assumed outcome to seed your bracket (0 pts, replaced by the real result)
            </span>
          </div>
        )}
        {VenueLine}
      </div>
    );
  }

  const BTN=({value,label,activeColor,activeText})=>(
    <button onClick={()=>onPickChange(match.id,value)}
      className="w-8 h-7 rounded font-black text-xs transition-all duration-100 active:scale-95 shrink-0"
      style={{background:pick===value?activeColor:"rgba(255,255,255,0.07)",color:pick===value?activeText:"rgba(255,255,255,0.4)",border:`1px solid ${pick===value?"transparent":"rgba(255,255,255,0.1)"}`}}>
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-xs font-semibold truncate text-right"
            style={teamNameStyle(homeW?"#c8f000":"rgba(255,255,255,0.75)")}
            onClick={()=>openTeam(home)} onMouseEnter={teamHover} onMouseLeave={teamLeave}>{home}</span>
          <span className={getFlagClass(home) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
        </div>
        <div className="flex gap-1 shrink-0">
          <BTN value="home" label="H" activeColor="#c8f000"  activeText="#1a0533"/>
          <BTN value="draw" label="X" activeColor="#f59e0b"  activeText="#1a0533"/>
          <BTN value="away" label="A" activeColor="#ef4444"  activeText="white"  />
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className={getFlagClass(away) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
          <span className="text-xs font-semibold truncate"
            style={teamNameStyle(awayW?"#ef4444":"rgba(255,255,255,0.75)")}
            onClick={()=>openTeam(away)} onMouseEnter={teamHover} onMouseLeave={teamLeave}>{away}</span>
        </div>
        <span style={{color:"rgba(255,255,255,0.18)",fontSize:"0.6rem",flexShrink:0}}>MD{matchday}</span>
        {ResultBadge}
      </div>
      {VenueLine}
    </div>
  );
}

// ── Group stage: mini standings ───────────────────────────────────────────────

function MiniStandings({ standings, thirds, onReorder, readOnly }) {
  const thirdTeams=new Set(thirds.map(t=>t.team));
  const { openTeam } = useTeamModal();

  // Detect which positions have a tie with the adjacent team
  function isTied(i, dir) {
    const a = standings[i], b = standings[i + dir];
    return b && a.pts === b.pts;
  }

  function move(i, dir) {
    if (readOnly) return;
    const next = [...standings];
    [next[i], next[i+dir]] = [next[i+dir], next[i]];
    onReorder(next.map(r => r.team));
  }

  return (
    <div className="pt-2 mt-2" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
      {standings.map((t,i)=>{
        const q=i<2, t3=i===2&&thirdTeams.has(t.team);
        const tiedAbove = i > 0 && isTied(i, -1);
        const tiedBelow = i < standings.length-1 && isTied(i, 1);
        const showArrows = !readOnly && (tiedAbove || tiedBelow);
        return (
          <div key={t.team} className="flex items-center gap-2 px-3 py-1">
            <span className="text-xs w-3 shrink-0" style={{color:"rgba(255,255,255,0.55)"}}>{i+1}</span>
            <span className={getFlagClass(t.team) ?? ''} style={{fontSize:'1rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
            <span className="text-xs flex-1 font-semibold truncate"
              style={{color:q?"#c8f000":t3?"#f59e0b":"rgba(255,255,255,0.35)",cursor:"pointer"}}
              onClick={()=>openTeam(t.team)}>
              {t.team}
            </span>
            {/* Tie indicator + reorder arrows */}
            {showArrows && (
              <div className="flex flex-col gap-0.5 shrink-0">
                {tiedAbove && (
                  <button onClick={()=>move(i,-1)}
                    className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                    style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b",fontSize:"0.55rem"}}
                    title="Move up (tied)">▲</button>
                )}
                {tiedBelow && (
                  <button onClick={()=>move(i,1)}
                    className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                    style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b",fontSize:"0.55rem"}}
                    title="Move down (tied)">▼</button>
                )}
              </div>
            )}
            {(tiedAbove || tiedBelow) && !showArrows && null}
            {(q||t3)&&(
              <span className="text-xs px-1 rounded shrink-0"
                style={{background:q?"rgba(200,240,0,0.12)":"rgba(245,158,11,0.12)",color:q?"#c8f000":"#f59e0b",fontSize:"0.6rem",fontWeight:700}}>
                {q?"Q":"3rd"}
              </span>
            )}
            <div className="flex gap-2 shrink-0 text-xs" style={{color:"rgba(255,255,255,0.6)"}}>
              <span>{t.w}W</span><span>{t.d}D</span><span>{t.l}L</span>
              <span className="font-black" style={{color:q?"#c8f000":t3?"#f59e0b":"rgba(255,255,255,0.25)",minWidth:16,textAlign:"right"}}>
                {t.pts}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────────

function GroupCard({ group, picks, scores, onPick, onScore, standings, thirds, mode, isOpen, onToggle, matchResults, onReorderStandings, readOnly, assumptions = {}, onAssume }) {
  const matches=GROUP_MATCHES.filter(m=>m.group===group);
  // Results and assumed outcomes count as resolved for the progress badge
  const picked=matches.filter(m=>picks[m.id] ?? matchResults?.[m.id]?.result ?? assumptions[m.id]).length;
  const done=picked===matches.length;
  const teams=[...new Set(matches.flatMap(m=>[m.home,m.away]))];
  const byDay={};
  for (const m of matches) { if(!byDay[m.matchday])byDay[m.matchday]=[]; byDay[m.matchday].push(m); }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        border:`1px solid ${done?"rgba(200,240,0,0.2)":isOpen?"rgba(200,240,0,0.15)":"rgba(255,255,255,0.07)"}`,
        background:done?"rgba(200,240,0,0.02)":isOpen?"rgba(255,255,255,0.03)":"transparent",
      }}>

      {/* Clickable header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
        style={{background:"transparent"}}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{background:done?"linear-gradient(135deg,#c8f000,#84cc16)":isOpen?"rgba(200,240,0,0.15)":"rgba(255,255,255,0.08)"}}>
            {done
              ? <span className="text-xs font-black" style={{color:"#1a0533"}}>✓</span>
              : <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.8rem",color:isOpen?"#c8f000":"rgba(255,255,255,0.6)"}}>
                  {group}
                </span>
            }
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-white">Group {group}</span>
            {!isOpen && (
              <p className="text-xs leading-none mt-0.5" style={{color:"rgba(255,255,255,0.28)",fontSize:"0.6rem"}}>
                {teams.slice(0,2).join(" · ")} · …
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-xs font-semibold" style={{color:done?"#c8f000":"rgba(255,255,255,0.3)"}}>
            {picked}/{matches.length}
          </span>
          <svg
            className="w-3.5 h-3.5 transition-transform duration-200"
            style={{color:"rgba(255,255,255,0.6)",transform:isOpen?"rotate(180deg)":"rotate(0deg)"}}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          {Object.entries(byDay).map(([day,dayMatches])=>(
            <div key={day}>
              <div className="px-3 py-1" style={{background:"rgba(255,255,255,0.02)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <span style={{fontSize:"0.6rem",fontWeight:700,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:"0.1em"}}>
                  Matchday {day}
                </span>
              </div>
              {dayMatches.map(m=>(
                <MatchPickRow key={m.id} match={m} pick={picks[m.id]} score={scores[m.id]}
                  onPickChange={onPick} onScoreChange={onScore} mode={mode} result={matchResults?.[m.id] ?? null}
                  locked={isMatchLocked(m.id)}
                  assumption={assumptions[m.id]} onAssume={readOnly ? undefined : onAssume} />
              ))}
            </div>
          ))}
          <MiniStandings standings={standings} thirds={thirds} onReorder={onReorderStandings} readOnly={readOnly} />
        </div>
      )}
    </div>
  );
}

// ── Knockout: bracket match card ──────────────────────────────────────────────

function BracketMatch({ home, away, winner, onPick, onForcePick, onScore, score, scoreMode, isFinal, locked }) {
  const { openTeam } = useTeamModal();
  const hVal=score?.home??0, aVal=score?.away??0;
  const hasScore=score!=null;
  const isTied=scoreMode&&hasScore&&hVal===aVal&&home&&away;

  if (scoreMode) {
    // Score-mode: auto-determine winner from score; tied → manual pens pick
    const scoreLeader=!hasScore?null:hVal>aVal?home:aVal>hVal?away:null;
    const effectiveWinner=isTied?winner:scoreLeader??winner;

    function chHome(v) {
      onScore(v,aVal);
      if (v!==aVal&&home&&away) onForcePick(v>aVal?home:away);
    }
    function chAway(v) {
      onScore(hVal,v);
      if (hVal!==v&&home&&away) onForcePick(hVal>v?home:away);
    }

    const homeOpacity=!isTied&&effectiveWinner&&effectiveWinner!==home?0.35:1;
    const awayOpacity=!isTied&&effectiveWinner&&effectiveWinner!==away?0.35:1;

    return (
      <div className="rounded-xl overflow-hidden"
        style={{width:172,background:effectiveWinner?"rgba(200,240,0,0.06)":"rgba(255,255,255,0.04)",
          border:`1px solid ${isFinal&&effectiveWinner?"rgba(200,240,0,0.45)":effectiveWinner?"rgba(200,240,0,0.2)":"rgba(255,255,255,0.09)"}`,
          boxShadow:isFinal&&effectiveWinner?"0 0 24px rgba(200,240,0,0.15)":"none"}}>

        {/* Home row */}
        <div className="flex items-center gap-2 px-2.5 py-2"
          style={{background:effectiveWinner===home?"rgba(200,240,0,0.12)":"transparent",opacity:homeOpacity,transition:"opacity 0.15s"}}>
          <span className={getFlagClass(home) ?? ''} style={{fontSize:'1rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
          <span className="text-xs font-semibold truncate flex-1"
            style={{color:effectiveWinner===home?"#c8f000":!home?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.8)",cursor:home?"pointer":"default"}}
            onClick={()=>home&&openTeam(home)}>
            {home??"TBD"}
          </span>
          {home&&<ScorePicker value={hVal} onChange={chHome}/>}
        </div>

        {/* Tied → pens row */}
        {isTied&&(
          <div className="flex items-center justify-center gap-1.5 py-1.5 px-2"
            style={{background:"rgba(245,158,11,0.08)",borderTop:"1px solid rgba(245,158,11,0.15)",borderBottom:"1px solid rgba(245,158,11,0.15)"}}>
            <span style={{fontSize:"0.55rem",color:"#f59e0b",fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase"}}>
              Tied · Pens:
            </span>
            {[home,away].map((team,ti)=>(
              <button key={team} onClick={()=>onForcePick(team)}
                className="text-xs font-bold px-1.5 py-0.5 rounded transition-all"
                style={{background:winner===team?(ti===0?"rgba(200,240,0,0.2)":"rgba(239,68,68,0.2)"):"rgba(255,255,255,0.08)",color:winner===team?(ti===0?"#c8f000":"#ef4444"):"rgba(255,255,255,0.4)",fontSize:"0.6rem"}}>
                {(team??"").split(" ")[0]}
                {winner===team&&" ✓"}
              </button>
            ))}
          </div>
        )}

        <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>

        {/* Away row */}
        <div className="flex items-center gap-2 px-2.5 py-2"
          style={{background:effectiveWinner===away?"rgba(200,240,0,0.12)":"transparent",opacity:awayOpacity,transition:"opacity 0.15s"}}>
          <span className={getFlagClass(away) ?? ''} style={{fontSize:'1rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
          <span className="text-xs font-semibold truncate flex-1"
            style={{color:effectiveWinner===away?"#c8f000":!away?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.8)",cursor:away?"pointer":"default"}}
            onClick={()=>away&&openTeam(away)}>
            {away??"TBD"}
          </span>
          {away&&<ScorePicker value={aVal} onChange={chAway}/>}
        </div>
      </div>
    );
  }

  // ── Winner-only mode ──────────────────────────────────────────────────────
  function TeamBtn({ team }) {
    const isW=winner===team, isL=winner&&winner!==team, isTbd=!team;
    return (
      <button onClick={()=>!locked&&team&&onPick(team)} disabled={isTbd||locked}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-all duration-100 active:scale-95"
        style={{background:isW?"rgba(200,240,0,0.15)":"transparent",cursor:(isTbd||locked)?"default":"pointer",opacity:isL?0.3:1}}>
        {!isTbd && <span className={getFlagClass(team) ?? ''} style={{fontSize:'1rem',lineHeight:1,display:'inline-block',flexShrink:0}} />}
        <span className="text-xs font-semibold truncate flex-1 leading-tight"
          style={{color:isW?"#c8f000":isTbd?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.8)"}}>
          {team??"TBD"}
        </span>
        {isW&&<span className="text-xs shrink-0" style={{color:"#c8f000"}}>✓</span>}
      </button>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden" style={{position:"relative",
      width:168,background:winner?"rgba(200,240,0,0.06)":"rgba(255,255,255,0.04)",
        border:`1px solid ${isFinal&&winner?"rgba(200,240,0,0.45)":winner?"rgba(200,240,0,0.2)":"rgba(255,255,255,0.09)"}`,
        boxShadow:isFinal&&winner?"0 0 24px rgba(200,240,0,0.15)":"none",
        opacity:locked?0.7:1}}>
      {locked&&<span style={{position:"absolute",top:3,right:4,fontSize:"0.6rem",zIndex:1,opacity:0.7}}>🔒</span>}
      <TeamBtn team={home}/>
      <div style={{height:1,background:"rgba(255,255,255,0.07)"}}/>
      <TeamBtn team={away}/>
    </div>
  );
}

// ── Prediction mode toggle (shared between both views) ────────────────────────

function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{color:"rgba(255,255,255,0.65)"}}>
        Prediction mode:
      </span>
      <div className="flex rounded-lg p-0.5 gap-0.5"
        style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.09)"}}>
        {[{id:"winner",label:"Winner only"},{id:"score",label:"Predict score"}].map(opt=>(
          <button key={opt.id} onClick={()=>onChange(opt.id)}
            className="px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-150"
            style={{background:mode===opt.id?"linear-gradient(135deg,#c8f000,#84cc16)":"transparent",color:mode===opt.id?"#1a0533":"rgba(255,255,255,0.45)"}}>
            {opt.label}
          </button>
        ))}
      </div>
      <span className="text-xs" style={{color:"rgba(255,255,255,0.2)"}}>
        {mode==="winner"
          ? "Group: H=home · X=draw · A=away  |  Bracket: click to advance"
          : "Enter goals for each team — result and winner are auto-determined"}
      </span>
    </div>
  );
}

// ── Per-match locking ─────────────────────────────────────────────────────────

function parseMatchKickoff(dateStr, timeStr) {
  const clean = timeStr.replace(" ET", "").trim();
  const [time, meridiem] = clean.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 4, m)); // EDT = UTC-4
}

// Knockout schedule: [date, time] per round+idx
const KO_SCHED = {
  R32: [
    ["2026-06-28","3:00 PM ET"],["2026-06-28","7:00 PM ET"],
    ["2026-06-29","3:00 PM ET"],["2026-06-29","7:00 PM ET"],
    ["2026-06-30","3:00 PM ET"],["2026-06-30","7:00 PM ET"],
    ["2026-07-01","3:00 PM ET"],["2026-07-01","7:00 PM ET"],
    ["2026-07-02","3:00 PM ET"],["2026-07-02","7:00 PM ET"],
    ["2026-07-03","3:00 PM ET"],["2026-07-03","7:00 PM ET"],
    ["2026-07-04","3:00 PM ET"],["2026-07-04","7:00 PM ET"],
    ["2026-07-05","3:00 PM ET"],["2026-07-05","7:00 PM ET"],
  ],
  R16: [
    ["2026-07-06","3:00 PM ET"],["2026-07-06","7:00 PM ET"],
    ["2026-07-07","3:00 PM ET"],["2026-07-07","7:00 PM ET"],
    ["2026-07-08","3:00 PM ET"],["2026-07-08","7:00 PM ET"],
    ["2026-07-09","3:00 PM ET"],["2026-07-09","7:00 PM ET"],
  ],
  QF: [
    ["2026-07-11","3:00 PM ET"],["2026-07-11","7:00 PM ET"],
    ["2026-07-12","3:00 PM ET"],["2026-07-12","7:00 PM ET"],
  ],
  SF: [["2026-07-14","7:00 PM ET"],["2026-07-15","7:00 PM ET"]],
  F:  [["2026-07-19","7:00 PM ET"]],
};

function isMatchLocked(matchId) {
  const m = GROUP_MATCHES.find(f => f.id === matchId);
  if (!m) return false;
  return Date.now() >= parseMatchKickoff(m.date, m.time);
}

function isKoMatchLocked(round, idx) {
  const entry = KO_SCHED[round]?.[idx];
  if (!entry) return false;
  return Date.now() >= parseMatchKickoff(entry[0], entry[1]);
}

const WC_KICKOFF = parseMatchKickoff("2026-06-11", "3:00 PM ET");
const isTournamentStarted = () => Date.now() >= WC_KICKOFF;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyBracket({ bracketData, onBack, onNavigate, readOnly = false, viewingUser = null }) {
  const [view,      setView]      = useState("groups");
  const mode = bracketData?.mode ?? "winner";
  const [openGroup, setOpenGroup] = useState("A");
  const [picks,  setPicks]  = useState(()=> bracketData?.picks  ?? {});
  const [scores, setScores] = useState(()=> bracketData?.scores ?? {});
  const [bw,     setBw]     = useState(()=>{
    const saved = bracketData?.bracket ?? null;
    return { ...emptyWinners(), ...(saved ?? {}) };
  });
  const [bScores,setBScores]= useState(()=> bracketData?.bracketScores ?? {});
  // confidence: { [matchId]: 1 | 2 | 3 } — multiplies points for correct picks
  const [confidence, setConfidence] = useState(()=> bracketData?.confidence ?? {});
  // assumptions: { [matchId]: "home"|"away"|"draw" } — assumed outcomes for matches
  // already locked when the user joined. Seed bracket standings only; never scored,
  // and superseded by the real result once it's in match_results.
  const [assumptions, setAssumptions] = useState(()=> bracketData?.assumptions ?? {});
  const [showPowerups, setShowPowerups] = useState(false);

  const isLocked = isTournamentStarted();

  const { user, loading: authLoading, signOut } = useAuth();
  const [showAuth,      setShowAuth]      = useState(false);
  const [authModalMode, setAuthModalMode] = useState("login");
  const [skippedAuth,   setSkippedAuth]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // null | "success" | "error"
  const [submitError,  setSubmitError]  = useState(null);
  const [isSubmitted,       setIsSubmitted]       = useState(false);
  const [restoreDone,       setRestoreDone]       = useState(false);
  const [showConfirmation,  setShowConfirmation]  = useState(false);
  const [saveIndicator,     setSaveIndicator]     = useState(null); // null | "saving" | "saved"
  const [tipDismissed, setTipDismissed] = useState(() => !!localStorage.getItem("wc2026_tip_dismissed"));
  const [matchResults, setMatchResults] = useState({});
  // groupOrderOverrides: { [group]: [team,team,team,team] } — user-reordered tiebreaks
  const [groupOrderOverrides, setGroupOrderOverrides] = useState(() => bracketData?.tiebreaks?.groupOrders ?? {});
  // thirdsUserPicks: array of group letters the user chose from the cut-line tied pool
  const [thirdsUserPicks, setThirdsUserPicks] = useState(() => bracketData?.tiebreaks?.thirds ?? []);
  const autoSaveRef = useRef(null);
  const thirdsSeededRef = useRef(false);
  const saveIndicatorRef = useRef(null);
  const leagueLinkedRef = useRef(false);
  const restoredRef = useRef(false);

  // Show welcome prompt if not logged in and hasn't skipped yet
  const showWelcome = !readOnly && !authLoading && !user && !skippedAuth;

  // On login: reconcile localStorage with Supabase. The cloud copy is the
  // source of truth unless the local copy is strictly newer (picks made while
  // logged out that haven't synced yet). Always loads is_submitted — skipping
  // it used to let stale devices autosave over a submitted bracket.
  useEffect(() => {
    if (!user || restoredRef.current || readOnly) return;
    restoredRef.current = true;
    supabase.from("submissions").select("picks,scores,bracket,bracket_scores,confidence,assumptions,tiebreaks,is_submitted,updated_at")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        setIsSubmitted(data.is_submitted ?? false);
        if (Object.keys(data.picks ?? {}).length === 0 &&
            Object.keys(data.assumptions ?? {}).length === 0) return;
        const dbUpdated    = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const localUpdated = bracketData?.updatedAt ?? 0;
        if (localUpdated > dbUpdated && Object.keys(picks).length > 0) return;
        setPicks(data.picks);
        setScores(data.scores ?? {});
        setBw({ ...emptyWinners(), ...(data.bracket ?? {}) });
        setBScores(data.bracket_scores ?? {});
        setConfidence(data.confidence ?? {});
        setAssumptions(data.assumptions ?? {});
        // Only adopt cloud tiebreaks when they exist — an empty object must not
        // wipe the auto-seeded best-thirds defaults (which seed before this fetch returns)
        const dbThirds = data.tiebreaks?.thirds ?? [];
        const dbOrders = data.tiebreaks?.groupOrders ?? {};
        if (dbThirds.length > 0) setThirdsUserPicks(dbThirds);
        if (Object.keys(dbOrders).length > 0) setGroupOrderOverrides(dbOrders);
        if (bracketData) {
          upsertBracket({ ...bracketData, picks: data.picks, scores: data.scores ?? {},
            bracket: data.bracket ?? null, bracketScores: data.bracket_scores ?? {},
            confidence: data.confidence ?? {},
            assumptions: data.assumptions ?? {},
            tiebreaks: {
              thirds:      dbThirds.length > 0 ? dbThirds : (bracketData.tiebreaks?.thirds ?? []),
              groupOrders: Object.keys(dbOrders).length > 0 ? dbOrders : (bracketData.tiebreaks?.groupOrders ?? {}),
            } });
        }
      })
      .then(() => setRestoreDone(true), () => setRestoreDone(true));
  }, [user]);

  // Fetch match results for pick result badges, then keep them fresh via Realtime
  // so TBD bracket slots fill in live as the feed writes final scores
  // (requires match_results in the supabase_realtime publication — migration 008)
  useEffect(() => {
    supabase.from("match_results").select("*")
      .then(({ data }) => { if (data) setMatchResults(buildResultsMap(data)); });
    const channel = supabase
      .channel("match-results-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results" },
        (payload) => {
          if (payload.new?.match_id) {
            setMatchResults(prev => ({ ...prev, [payload.new.match_id]: payload.new }));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Auto-save to Supabase (debounced 1.5s) whenever picks change and user is logged in.
  // Held until the cloud copy has been reconciled (restoreDone) so a stale
  // localStorage copy can never clobber the DB on page load.
  useEffect(() => {
    if (!user || readOnly || isSubmitted || !restoreDone) return;
    clearTimeout(autoSaveRef.current);
    setSaveIndicator("saving");
    autoSaveRef.current = setTimeout(async () => {
      const hasData = Object.keys(picks).length > 0 || Object.keys(assumptions).length > 0 || Object.values(bw).some(arr => Array.isArray(arr) && arr.some(Boolean));
      if (!hasData) { setSaveIndicator(null); return; }
      await supabase.from("submissions").upsert({
        user_id:           user.id,
        email:             user.email,
        display_name:      user.user_metadata?.display_name ?? "",
        mode,
        picks,
        scores,
        bracket:           bw,
        bracket_scores:    bScores,
        confidence,
        assumptions,
        tiebreaks:         { thirds: thirdsUserPicks, groupOrders: groupOrderOverrides },
        group_picks_count: Object.keys(picks).length,
        updated_at:        new Date().toISOString(),
      }, { onConflict: "user_id" });

      setSaveIndicator("saved");
      clearTimeout(saveIndicatorRef.current);
      saveIndicatorRef.current = setTimeout(() => setSaveIndicator(null), 2500);

      // Once per session: link this submission to any leagues that are missing it
      if (!leagueLinkedRef.current) {
        leagueLinkedRef.current = true;
        const { data: sub } = await supabase.from("submissions").select("id").eq("user_id", user.id).maybeSingle();
        if (sub) {
          const { data: unlinked } = await supabase
            .from("league_members")
            .select("league_id")
            .eq("user_id", user.id)
            .is("submission_id", null);
          if (unlinked?.length) {
            await Promise.all(unlinked.map(m =>
              supabase.from("league_members").update({ submission_id: sub.id }).eq("league_id", m.league_id).eq("user_id", user.id)
            ));
          }
        }
      }
    }, 1500);
    return () => clearTimeout(autoSaveRef.current);
  }, [picks, scores, bw, bScores, confidence, assumptions, thirdsUserPicks, groupOrderOverrides, user, isSubmitted, restoreDone]);

  // Persist the whole bracket object to localStorage whenever anything changes
  function save(newPicks, newScores, newBw, newBScores, newConfidence = confidence, newAssumptions = assumptions) {
    if (!bracketData || readOnly || isSubmitted) return;
    upsertBracket({ ...bracketData, picks: newPicks, scores: newScores, bracket: newBw, bracketScores: newBScores, confidence: newConfidence,
      assumptions: newAssumptions,
      tiebreaks: { thirds: thirdsUserPicks, groupOrders: groupOrderOverrides } });
  }

  // Tiebreak choices change outside save()'s call sites — persist them to localStorage themselves
  useEffect(() => {
    if (!bracketData || readOnly || isSubmitted) return;
    upsertBracket({ ...bracketData, picks, scores, bracket: bw, bracketScores: bScores, confidence, assumptions,
      tiebreaks: { thirds: thirdsUserPicks, groupOrders: groupOrderOverrides } });
  }, [thirdsUserPicks, groupOrderOverrides]);

  async function handleSubmit() {
    if (!user) { setShowAuth(true); return; }
    const hasData = Object.keys(picks).length > 0 || Object.values(bw).some(arr => Array.isArray(arr) && arr.some(Boolean));
    if (!hasData) return;
    setSubmitting(true);
    setSubmitStatus(null);
    try {
      const { error } = await supabase.from("submissions").upsert({
        user_id:           user.id,
        email:             user.email,
        display_name:      user.user_metadata?.display_name ?? "",
        mode,
        picks,
        scores,
        bracket:           bw,
        bracket_scores:    bScores,
        confidence,
        assumptions,
        tiebreaks:         { thirds: thirdsUserPicks, groupOrders: groupOrderOverrides },
        group_picks_count: Object.keys(picks).length,
        is_submitted:      true,
        updated_at:        new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      const hasKnockoutPicks = Object.values(bw).some(arr => Array.isArray(arr) && arr.some(Boolean));
      if (hasKnockoutPicks) {
        setIsSubmitted(true);
        setShowConfirmation(true);
      } else {
        setSubmitStatus("success");
        setView("knockout");
      }
    } catch (err) {
      setSubmitError(err.message);
      setSubmitStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!user) return;
    try {
      const { error } = await supabase.from("submissions")
        .update({ is_submitted: false }).eq("user_id", user.id);
      if (error) throw error;
      setIsSubmitted(false);
      setSubmitStatus(null);
    } catch { /* ignore */ }
  }

  const { byGroup, thirds, r32Slots, effectivePicks } = useMemo(()=>{
    // For locked matches the user hasn't picked, fall back to the actual result —
    // or, while no result is in yet, the user's assumed outcome — so group standings
    // and bracket seeding stay correct for late-entry users.
    const effectivePicks = { ...picks };
    for (const m of GROUP_MATCHES) {
      if (effectivePicks[m.id] == null && isMatchLocked(m.id)) {
        effectivePicks[m.id] = matchResults[m.id]?.result ?? assumptions[m.id] ?? null;
      }
    }
    const byGroup=computeAllStandings(effectivePicks);
    // Apply any manual group order overrides (user-resolved tiebreaks)
    for (const [g, order] of Object.entries(groupOrderOverrides)) {
      if (byGroup[g]) {
        byGroup[g] = order.map(team => byGroup[g].find(r => r.team === team)).filter(Boolean);
      }
    }
    // Compute thirds from (possibly overridden) standings
    const autoThirds = computeThirds(byGroup);
    // Resolve cut-line ties using user picks where provided
    const allThirdsSorted = GROUPS
      .map(g => ({ ...byGroup[g]?.[2], group: g }))
      .filter(t => t.team)
      .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
    const cutLinePts = allThirdsSorted[7]?.pts ?? 0;
    const autoQualified = allThirdsSorted.filter(t => (t.pts ?? 0) > cutLinePts);
    const tiedAtCut = allThirdsSorted.filter(t => (t.pts ?? 0) === cutLinePts);
    const spotsLeft = 8 - autoQualified.length;
    // Pick spotsLeft teams from tiedAtCut: prefer user picks, fallback to auto order
    const userPicksFromTied = thirdsUserPicks.filter(g => tiedAtCut.some(t => t.group === g));
    const autoFill = tiedAtCut.filter(t => !userPicksFromTied.includes(t.group)).slice(0, spotsLeft - userPicksFromTied.length);
    const resolvedTied = [...tiedAtCut.filter(t => userPicksFromTied.includes(t.group)), ...autoFill].slice(0, spotsLeft);
    const resolvedThirds = [...autoQualified, ...resolvedTied];
    while (resolvedThirds.length < 8) resolvedThirds.push({ team: null });
    return { byGroup, thirds: resolvedThirds, r32Slots:buildR32Slots(byGroup,resolvedThirds,effectivePicks), effectivePicks };
  },[picks, assumptions, groupOrderOverrides, thirdsUserPicks, matchResults]);

  const unlockedMatches = GROUP_MATCHES.filter(m => !isMatchLocked(m.id));
  const totalMatches = unlockedMatches.length;
  const pickedCount  = unlockedMatches.filter(m => picks[m.id] != null).length;
  const allPicked    = totalMatches > 0 && pickedCount === totalMatches;
  // Matches with no pick, no real result, and no assumed outcome — these keep
  // bracket slots stuck on TBD
  const unresolvedCount = GROUP_MATCHES.filter(m => effectivePicks[m.id] == null).length;

  // Pre-pick the best 3rd-place teams at the cut-line tie by default — users
  // who don't care about the tiebreak get a complete bracket without doing
  // anything; anyone else can unpick a team to swap in a different one.
  useEffect(() => {
    if (thirdsSeededRef.current || !allPicked || thirdsUserPicks.length > 0) return;
    const sorted = GROUPS
      .map(g => ({ group: g, team: byGroup[g]?.[2]?.team ?? null, pts: byGroup[g]?.[2]?.pts ?? 0 }))
      .sort((a, b) => b.pts - a.pts);
    const cutLinePts = sorted[7]?.pts ?? 0;
    const autoQualified = sorted.filter(t => t.pts > cutLinePts);
    const tiedAtCut = sorted.filter(t => t.pts === cutLinePts);
    const spotsLeft = 8 - autoQualified.length;
    if (tiedAtCut.length <= spotsLeft) return; // no tie to resolve
    thirdsSeededRef.current = true;
    setThirdsUserPicks(tiedAtCut.slice(0, spotsLeft).map(t => t.group));
  }, [allPicked, byGroup, thirdsUserPicks]);

  // SF losers for 3rd place
  const sf1Loser = getSFLoser(0,bw,r32Slots);
  const sf2Loser = getSFLoser(1,bw,r32Slots);

  // Pick counts
  const bracketPicks = ROUNDS.reduce((s,r)=>s+bw[r].filter(Boolean).length,0) + (bw["3P"][0]?1:0);
  const maxBracket   = 31+1; // 31 rounds + 3rd place

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleGroupPick(matchId, pick) {
    if (readOnly || isSubmitted || isMatchLocked(matchId)) return;
    const newPicks = {...picks, [matchId]: pick};
    const fresh = emptyWinners();
    setPicks(newPicks);
    setBw(fresh);
    setBScores({});
    save(newPicks, scores, fresh, {});
  }

  // Assumed outcome for a match that was already locked when the user joined.
  // Only allowed while no real result exists; reseeds the bracket like a pick.
  function handleAssumption(matchId, pick) {
    if (readOnly || isSubmitted || !isMatchLocked(matchId) || matchResults[matchId]?.result) return;
    const newAssumptions = {...assumptions, [matchId]: pick};
    const fresh = emptyWinners();
    setAssumptions(newAssumptions);
    setBw(fresh);
    setBScores({});
    save(picks, scores, fresh, {}, confidence, newAssumptions);
  }

  function handleConfidence(matchId, value) {
    if (readOnly || isSubmitted || isMatchLocked(matchId)) return;
    const next = { ...confidence, [matchId]: normalizeConfidence(value) };
    setConfidence(next);
    save(picks, scores, bw, bScores, next);
  }

  function handleGroupScore(matchId, h, a) {
    if (readOnly || isSubmitted || isMatchLocked(matchId)) return;
    const newScores = {...scores, [matchId]:{home:h,away:a}};
    setScores(newScores);
    save(picks, newScores, bw, bScores);
  }

  function handleBracketPick(round, matchIdx, team) {
    if (readOnly || isSubmitted || isKoMatchLocked(round, matchIdx)) return;
    const next=applyPick(bw,round,matchIdx,team,false);
    setBw(next); save(picks, scores, next, bScores);
  }

  function handleBracketForcePick(round, matchIdx, team) {
    if (readOnly || isSubmitted || isKoMatchLocked(round, matchIdx)) return;
    const next=applyPick(bw,round,matchIdx,team,true);
    setBw(next); save(picks, scores, next, bScores);
  }

  function handleBracketScore(scoreKey, h, a) {
    const [round, idxStr] = scoreKey.split("_");
    if (readOnly || isSubmitted || isKoMatchLocked(round, Number(idxStr))) return;
    const newBs = {...bScores, [scoreKey]:{home:h,away:a}};
    setBScores(newBs);
    save(picks, scores, bw, newBs);
  }

  function handle3PPick(team) {
    if (readOnly || isSubmitted || isKoMatchLocked("3P", 0)) return;
    const next={...bw,"3P":[team===bw["3P"][0]?null:team]};
    setBw(next); save(picks, scores, next, bScores);
  }

  function handle3PScore(h, a) {
    if (readOnly || isSubmitted || isKoMatchLocked("3P", 0)) return;
    const key="3P_0";
    const newBs = {...bScores, [key]:{home:h,away:a}};
    setBScores(newBs);
    if (sf1Loser&&sf2Loser&&h!==a) {
      const winner=h>a?sf1Loser:sf2Loser;
      const next={...bw,"3P":[winner]};
      setBw(next); save(picks, scores, next, newBs);
    } else {
      save(picks, scores, bw, newBs);
    }
  }

  function handle3PForcePick(team) {
    if (isKoMatchLocked("3P", 0)) return;
    if (bw["3P"][0] === team) return;
    const next={...bw,"3P":[team]};
    setBw(next); save(picks, scores, next, bScores);
  }

  function handleResetAll() {
    if (isLocked) return;
    // Preserve picks for locked matches
    const keptPicks = {};
    for (const m of GROUP_MATCHES) {
      if (isMatchLocked(m.id) && picks[m.id] != null) keptPicks[m.id] = picks[m.id];
    }
    const keptScores = {};
    for (const m of GROUP_MATCHES) {
      if (isMatchLocked(m.id) && scores[m.id] != null) keptScores[m.id] = scores[m.id];
    }
    // Preserve locked KO winners
    const fresh = emptyWinners();
    const keptBw = { ...fresh };
    for (const round of ROUNDS) {
      for (let i = 0; i < ROUND_COUNTS[round]; i++) {
        if (isKoMatchLocked(round, i) && bw[round][i] != null) keptBw[round][i] = bw[round][i];
      }
    }
    const keptBScores = {};
    for (const round of ROUNDS) {
      for (let i = 0; i < ROUND_COUNTS[round]; i++) {
        const key = `${round}_${i}`;
        if (isKoMatchLocked(round, i) && bScores[key] != null) keptBScores[key] = bScores[key];
      }
    }
    const keptConfidence = {};
    for (const m of GROUP_MATCHES) {
      if (isMatchLocked(m.id) && confidence[m.id] != null) keptConfidence[m.id] = confidence[m.id];
    }
    setPicks(keptPicks); setScores(keptScores); setBw(keptBw); setBScores(keptBScores); setConfidence(keptConfidence);
    // Clear tiebreak choices and let the best-thirds defaults reseed
    setThirdsUserPicks([]); setGroupOrderOverrides({}); thirdsSeededRef.current = false;
    save(keptPicks, keptScores, keptBw, keptBScores, keptConfidence);
  }

  function handleRandomPick() {
    if (readOnly || isSubmitted) return;
    const rand = arr => arr[Math.floor(Math.random() * arr.length)];

    // 1. Random group picks — preserve locked matches
    const newPicks = {};
    for (const m of GROUP_MATCHES) {
      newPicks[m.id] = isMatchLocked(m.id) && picks[m.id] != null
        ? picks[m.id]
        : rand(["home", "away", "draw"]);
    }

    // 2. Compute standings from those picks
    const newByGroup = computeAllStandings(newPicks);
    const newThirds = computeThirds(newByGroup);
    const newSlots = buildR32Slots(newByGroup, newThirds, newPicks);

    // 3. Walk the bracket — preserve locked KO matches, randomize the rest
    let newBw = emptyWinners();

    // Seed locked KO winners first so they flow forward
    for (const round of ROUNDS) {
      for (let i = 0; i < ROUND_COUNTS[round]; i++) {
        if (isKoMatchLocked(round, i) && bw[round][i] != null) newBw[round][i] = bw[round][i];
      }
    }

    for (let i = 0; i < 16; i++) {
      if (isKoMatchLocked("R32", i)) continue; // already seeded above
      const home = newSlots[i].home, away = newSlots[i].away;
      const candidates = [home, away].filter(Boolean);
      if (candidates.length > 0) newBw = applyPick(newBw, "R32", i, rand(candidates), true);
    }
    for (const round of ["R16", "QF", "SF", "F"]) {
      const count = ROUND_COUNTS[round];
      for (let i = 0; i < count; i++) {
        if (isKoMatchLocked(round, i)) continue;
        const [hr, hi, ar, ai] = MATCH_SOURCES[round][i];
        const home = newBw[hr][hi], away = newBw[ar][ai];
        const candidates = [home, away].filter(Boolean);
        if (candidates.length > 0) newBw = applyPick(newBw, round, i, rand(candidates), true);
      }
    }

    // 4. 3rd place — only randomize if not locked
    if (!isKoMatchLocked("3P", 0)) {
      const sfHome0 = newBw["QF"][MATCH_SOURCES["SF"][0][1]];
      const sfAway0 = newBw["QF"][MATCH_SOURCES["SF"][0][3]];
      const sf0L = [sfHome0, sfAway0].find(t => t && t !== newBw["SF"][0]) ?? null;
      const sfHome1 = newBw["QF"][MATCH_SOURCES["SF"][1][1]];
      const sfAway1 = newBw["QF"][MATCH_SOURCES["SF"][1][3]];
      const sf1L = [sfHome1, sfAway1].find(t => t && t !== newBw["SF"][1]) ?? null;
      if (sf0L && sf1L) newBw = { ...newBw, "3P": [rand([sf0L, sf1L])] };
    }

    // Preserve locked KO scores
    const keptBScores = {};
    for (const round of ROUNDS) {
      for (let i = 0; i < ROUND_COUNTS[round]; i++) {
        const key = `${round}_${i}`;
        if (isKoMatchLocked(round, i) && bScores[key] != null) keptBScores[key] = bScores[key];
      }
    }

    setPicks(newPicks);
    setScores({});
    setBw(newBw);
    setBScores(keptBScores);
    setGroupOrderOverrides({});
    setThirdsUserPicks([]);
    save(newPicks, {}, newBw, keptBScores);
  }

  const champion=bw.F[0];
  const SLOT_H=80, BRACKET_H=16*SLOT_H;

  return (
    <>
    <div className="px-4 py-10" style={{maxWidth:"100vw"}}>

      {/* ── Back bar + bracket name ── */}
      {onBack && (
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.5)",border:"1px solid rgba(255,255,255,0.09)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.1)";e.currentTarget.style.color="white";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="rgba(255,255,255,0.5)";}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <span className="text-sm font-black text-white truncate"
            style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.3rem",letterSpacing:"0.05em"}}>
            {readOnly ? `${viewingUser?.username ?? "User"}'s Bracket` : (bracketData?.name ?? "Bracket")}
          </span>
          {readOnly ? (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background:"rgba(99,102,241,0.12)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.25)"}}>
              View Only
            </span>
          ) : isSubmitted ? (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background:"rgba(34,197,94,0.12)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.25)"}}>
              ✓ Submitted
            </span>
          ) : saveIndicator === "saving" ? (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.65)",border:"1px solid rgba(255,255,255,0.1)"}}>
              Saving…
            </span>
          ) : saveIndicator === "saved" ? (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background:"rgba(200,240,0,0.1)",color:"#c8f000",border:"1px solid rgba(200,240,0,0.2)"}}>
              ✓ Saved
            </span>
          ) : isLocked ? (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background:"rgba(245,158,11,0.12)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.25)"}}>
              ⚽ In Progress
            </span>
          ) : (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.6)",border:"1px solid rgba(255,255,255,0.08)"}}>
              Draft
            </span>
          )}
        </div>
      )}

      {/* ── Tournament in-progress banner ── */}
      {isLocked && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-xl"
          style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.25)"}}>
          <span className="text-xl">⚽</span>
          <div>
            <p className="font-bold text-sm" style={{color:"#f59e0b"}}>Tournament In Progress</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.7)"}}>
              Matches lock one by one at kickoff — games that have already started are marked 🔒 and can't be changed.
              You can still edit your picks for any upcoming match and your knockout bracket. Changes save to your account automatically.
            </p>
          </div>
        </div>
      )}

      {/* ── Submitted notice — picks are read-only until "Edit Bracket" ── */}
      {!readOnly && isSubmitted && (
        <div className="flex items-center gap-4 mb-6 px-5 py-4 rounded-2xl flex-wrap"
          style={{background:"rgba(34,197,94,0.07)",border:"1px solid rgba(34,197,94,0.3)"}}>
          <span style={{fontSize:"1.6rem"}}>✅</span>
          <div className="flex-1" style={{minWidth:200}}>
            <p className="font-bold" style={{color:"#22c55e",fontSize:"1rem"}}>Bracket Submitted</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.7)"}}>
              Your picks are locked in while submitted. Hit "Edit Bracket" to unlock and make changes — games that haven't kicked off yet stay editable.
            </p>
          </div>
          <button
            onClick={handleWithdraw}
            className="shrink-0 flex items-center gap-2 rounded-2xl font-black transition-all duration-200 active:scale-95"
            style={{
              padding: "16px 32px",
              fontSize: "1.05rem",
              letterSpacing: "0.04em",
              background: "linear-gradient(135deg,#c8f000,#84cc16)",
              color: "#1a0533",
              boxShadow: "0 0 24px rgba(200,240,0,0.45), 0 6px 20px rgba(0,0,0,0.4)",
              animation: "editPulse 2s ease-in-out infinite",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = "0 0 36px rgba(200,240,0,0.65), 0 6px 20px rgba(0,0,0,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 0 24px rgba(200,240,0,0.45), 0 6px 20px rgba(0,0,0,0.4)"; }}>
            ✏️ EDIT BRACKET
          </button>
        </div>
      )}

      {/* ── Welcome / sign-in prompt ── */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:"rgba(10,2,26,0.92)",backdropFilter:"blur(8px)"}}>
          <div className="relative w-full max-w-sm rounded-2xl p-8 text-center"
            style={{
              background:"linear-gradient(160deg,#1f0645 0%,#160336 100%)",
              border:"1px solid rgba(255,255,255,0.1)",
              boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
            }}>

            <div className="text-5xl mb-4">🏆</div>

            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{color:"#ef4444"}}>
              World Cup 2026
            </p>
            <h3 className="text-white mb-2 leading-none"
              style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2rem",letterSpacing:"0.04em"}}>
              Make My Bracket
            </h3>
            <p className="text-sm mb-6" style={{color:"rgba(255,255,255,0.7)"}}>
              Sign in to save your predictions and compete with friends.
              Your picks are always saved locally even if you skip.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setAuthModalMode("signup"); setShowAuth(true); }}
                className="w-full py-3 rounded-xl font-black text-sm transition-all duration-150 active:scale-95"
                style={{background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"white",boxShadow:"0 0 24px rgba(220,38,38,0.4)"}}>
                Create Account & Enter
              </button>
              <button
                onClick={() => { setAuthModalMode("login"); setShowAuth(true); }}
                className="w-full py-3 rounded-xl font-black text-sm transition-all duration-150 active:scale-95"
                style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.8)"}}>
                Sign In
              </button>
              <button
                onClick={() => setSkippedAuth(true)}
                className="text-xs mt-1 transition-colors"
                style={{color:"rgba(255,255,255,0.55)"}}
                onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.5)"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.25)"}>
                Skip for now — I'll sign in before submitting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Powerups modal */}
      {showPowerups && (
        <PowerupsModal
          confidence={confidence}
          picks={picks}
          readOnly={readOnly || isSubmitted || isLocked}
          onChange={newConf => {
            setConfidence(newConf);
            save(picks, scores, bw, bScores, newConf);
          }}
          onClose={() => setShowPowerups(false)}
        />
      )}

      {/* Auth modal */}
      {showAuth && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setShowAuth(false)}
          onAuth={() => {
            setShowAuth(false);
            setSkippedAuth(false);
          }}
        />
      )}

      {/* Header */}
      {!readOnly && (
      <div className="mb-6" style={{maxWidth:860}}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <h2 className="text-white"
            style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2rem",letterSpacing:"0.08em"}}>
            Make My Bracket
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRandomPick}
              className="flex items-center gap-2 font-semibold transition-all duration-200 active:scale-95"
              style={{
                padding: "8px 16px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.6)",
                fontSize: "0.8rem",
                letterSpacing: "0.03em",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            >
              <span style={{ fontSize: "1rem" }}>🎲</span>
              Random Picker
            </button>
            {user && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full font-semibold"
                  style={{background:"rgba(200,240,0,0.1)",border:"1px solid rgba(200,240,0,0.2)",color:"#c8f000"}}>
                  ✓ {user.user_metadata?.display_name || user.email}
                </span>
                <button onClick={signOut}
                  style={{color:"rgba(255,255,255,0.6)"}}
                  onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.6)"}
                  onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.3)"}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-sm mb-4" style={{color:"rgba(255,255,255,0.65)"}}>
          Your predictions
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-1.5 rounded-full overflow-hidden"
              style={{background:"rgba(255,255,255,0.08)",width:180}}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{width:`${Math.round((pickedCount/totalMatches)*100)}%`,
                  background:allPicked?"linear-gradient(90deg,#c8f000,#22c55e)":"linear-gradient(90deg,#c8f000,#84cc16)"}}/>
            </div>
            <span className="text-xs font-semibold" style={{color:allPicked?"#22c55e":"#c8f000"}}>
              {pickedCount}/{totalMatches} group picks
            </span>
          </div>
          <button onClick={handleResetAll}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.7)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.1)";e.currentTarget.style.color="rgba(255,255,255,0.7)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="rgba(255,255,255,0.45)";}}>
            ↺ Reset all
          </button>
          {!readOnly && (() => {
            const used = Object.values(confidence).filter(v => v > 1).length;
            return (
              <button onClick={() => setShowPowerups(true)}
                className="font-black transition-all duration-200 active:scale-95 flex items-center gap-2"
                style={{
                  padding: "8px 16px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg,#ff6b35,#f7c948,#22d3a4,#6366f1)",
                  backgroundSize: "300% 300%",
                  animation: "gradientShift 3s ease infinite",
                  boxShadow: "0 0 16px rgba(99,102,241,0.4), 0 0 32px rgba(34,211,164,0.2)",
                  color: "#fff",
                  fontSize: "0.8rem",
                  letterSpacing: "0.03em",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 24px rgba(99,102,241,0.65), 0 0 48px rgba(34,211,164,0.35)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 16px rgba(99,102,241,0.4), 0 0 32px rgba(34,211,164,0.2)"; e.currentTarget.style.transform = "scale(1)"; }}
              >
                <span style={{ fontSize: "1rem" }}>⚡</span>
                POWERUPS
                {/* Boost counter hidden while powerups are in "coming soon" mode — restore alongside PowerupsModal's COMING_SOON flag */}
              </button>
            );
          })()}
        </div>
      </div>
      )}

      {/* View switcher */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl"
        style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",display:"inline-flex"}}>
        {[{id:"groups",label:`Group Stage (${pickedCount}/${totalMatches})`},{id:"knockout",label:"Knockout Bracket"}].map(tab=>(
          <button key={tab.id} onClick={()=>setView(tab.id)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
            style={{background:view===tab.id?"linear-gradient(135deg,#c8f000,#84cc16)":"transparent",color:view===tab.id?"#1a0533":"rgba(255,255,255,0.5)",letterSpacing:"0.02em"}}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tip banner — first visit only, group view */}
      {!readOnly && !isSubmitted && view === "groups" && !tipDismissed && (
        <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-xl"
          style={{ background: "rgba(200,240,0,0.06)", border: "1px solid rgba(200,240,0,0.18)" }}>
          <span style={{ fontSize: "1.1rem", lineHeight: 1.4 }}>💡</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold mb-0.5" style={{ color: "#c8f000" }}>How this works</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
              Pick the winner of every group match (72 total). Your bracket seeds automatically — then pick knockout winners all the way to the Final and hit <strong style={{ color: "rgba(255,255,255,0.85)" }}>Submit</strong> to lock your entry.
              Use the <strong style={{ color: "#c8f000" }}>⚡ POWERUPS</strong> button to assign your 3× ×2 and 3× ×3 boosts — correct boosted picks earn double or triple points.
            </p>
          </div>
          <button
            onClick={() => { localStorage.setItem("wc2026_tip_dismissed", "1"); setTipDismissed(true); }}
            className="shrink-0 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.07)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
          >✕</button>
        </div>
      )}

      {/* Progress nudge bar */}
      {!readOnly && !isSubmitted && !isLocked && (() => {
        const bracketPickCount = Object.values(bw).reduce((n, arr) => n + (Array.isArray(arr) ? arr.filter(Boolean).length : 0), 0);
        const maxBracketPicks = ROUNDS.reduce((n, r) => n + ROUND_COUNTS[r], 0);
        let stage, accent, label;
        if (!allPicked) {
          stage = 1; accent = "#f59e0b";
          label = `Step 1 of 3 — Pick all ${totalMatches} group matches (${pickedCount} / ${totalMatches} done)`;
        } else if (bracketPickCount < maxBracketPicks) {
          stage = 2; accent = "#c8f000";
          label = `Step 2 of 3 — Pick your knockout bracket`;
        } else {
          stage = 3; accent = "#22c55e";
          label = `Step 3 of 3 — Ready! Hit Submit to lock your bracket 🏆`;
        }
        const pct = stage === 1 ? (pickedCount / totalMatches) * 33 : stage === 2 ? 33 + (bracketPickCount / maxBracketPicks) * 34 : 100;
        return (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${accent}30` }}>
            <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: `${accent}0d` }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: accent }}>{label}</p>
              </div>
              <span className="text-xs font-black tabular-nums shrink-0" style={{ color: accent }}>{Math.round(pct)}%</span>
            </div>
            <div className="h-1" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: accent }} />
            </div>
          </div>
        );
      })()}

      {/* ══ GROUP STAGE ══════════════════════════════════════════════════════ */}
      {view==="groups"&&(
        <div>
          {allPicked && !readOnly &&(
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
              style={{background:"rgba(200,240,0,0.06)",border:"1px solid rgba(200,240,0,0.2)"}}>
              <span className="text-lg">✅</span>
              <div>
                <p className="text-sm font-bold" style={{color:"#c8f000"}}>All group picks complete!</p>
                <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.7)"}}>
                  Switch to <strong>Knockout Bracket</strong> to pick your champion.
                </p>
              </div>
              <button onClick={()=>setView("knockout")}
                className="ml-auto px-4 py-2 rounded-lg text-sm font-bold"
                style={{background:"linear-gradient(135deg,#c8f000,#84cc16)",color:"#1a0533"}}>
                View Bracket →
              </button>
            </div>
          )}

          {/* 3rd-place qualifiers — shown once all groups are complete */}
          {allPicked && (() => {
            const allThirdsSorted = GROUPS
              .map(g => ({ group: g, team: byGroup[g]?.[2]?.team ?? null, pts: byGroup[g]?.[2]?.pts ?? 0 }))
              .sort((a, b) => b.pts - a.pts);
            const cutLinePts = allThirdsSorted[7]?.pts ?? 0;
            const autoQualified = allThirdsSorted.filter(t => t.pts > cutLinePts);
            const tiedAtCut = allThirdsSorted.filter(t => t.pts === cutLinePts);
            const belowCut = allThirdsSorted.filter(t => t.pts < cutLinePts);
            const spotsLeft = 8 - autoQualified.length;
            const hasTie = tiedAtCut.length > spotsLeft;
            const userPicksFromTied = thirdsUserPicks.filter(g => tiedAtCut.some(t => t.group === g));
            const canStillPick = userPicksFromTied.length < spotsLeft;

            const toggleTied = (g) => {
              if (readOnly || isSubmitted) return;
              if (userPicksFromTied.includes(g)) {
                setThirdsUserPicks(prev => prev.filter(x => x !== g));
              } else if (canStillPick) {
                setThirdsUserPicks(prev => [...prev, g]);
              }
            };

            return (
              <div className="mb-5 px-4 py-4 rounded-xl" style={{background:"rgba(245,158,11,0.04)",border:"1px solid rgba(245,158,11,0.18)"}}>
                <p className="text-xs font-black uppercase tracking-widest mb-0.5" style={{color:"#f59e0b"}}>Best 3rd-Place Qualifiers</p>
                <p className="text-xs mb-3" style={{color:"rgba(255,255,255,0.5)"}}>Top 8 of 12 third-place teams advance to the knockout round</p>

                {/* Auto-qualified (clearly above cut line) */}
                {autoQualified.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs mb-1.5" style={{color:"rgba(255,255,255,0.3)",fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.08em"}}>Qualified ({autoQualified.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {autoQualified.map(({ group: g, team, pts }) => (
                        <div key={g} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                          style={{background:"rgba(200,240,0,0.07)",border:"1px solid rgba(200,240,0,0.2)"}}>
                          <span className={getFlagClass(team) ?? ''} style={{fontSize:"0.9rem",lineHeight:1}} />
                          <span className="text-xs font-semibold" style={{color:"rgba(255,255,255,0.85)"}}>{team ?? "TBD"}</span>
                          <span className="text-xs font-black" style={{color:"#c8f000"}}>{pts}pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tied at cut line — user picks */}
                {hasTie && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-black" style={{color:"#f59e0b",fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.08em"}}>
                        {userPicksFromTied.length >= spotsLeft
                          ? `Tied at ${cutLinePts} pts — best teams picked for you, unpick to swap`
                          : `Tied at ${cutLinePts} pts — pick ${spotsLeft - userPicksFromTied.length} more`}
                      </p>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-black" style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b",fontSize:"0.6rem"}}>
                        {userPicksFromTied.length}/{spotsLeft}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tiedAtCut.map(({ group: g, team, pts }) => {
                        const picked = userPicksFromTied.includes(g);
                        const disabled = !picked && !canStillPick;
                        return (
                          <button key={g}
                            onClick={() => toggleTied(g)}
                            disabled={disabled}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
                            style={{
                              background: picked ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.05)",
                              border: `1px solid ${picked ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`,
                              opacity: disabled ? 0.35 : 1,
                              cursor: disabled ? "not-allowed" : "pointer",
                            }}>
                            <span className={getFlagClass(team) ?? ''} style={{fontSize:"0.9rem",lineHeight:1}} />
                            <span className="text-xs font-semibold" style={{color:picked?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.6)"}}>{team ?? "TBD"}</span>
                            <span className="text-xs font-black" style={{color:picked?"#f59e0b":"rgba(255,255,255,0.3)"}}>{pts}pts</span>
                            {picked && <span style={{color:"#f59e0b",fontSize:"0.65rem",fontWeight:900}}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Not tied — just show the 8th qualifier normally */}
                {!hasTie && tiedAtCut.length > 0 && (
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {tiedAtCut.slice(0, spotsLeft).map(({ group: g, team, pts }) => (
                        <div key={g} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                          style={{background:"rgba(200,240,0,0.07)",border:"1px solid rgba(200,240,0,0.2)"}}>
                          <span className={getFlagClass(team) ?? ''} style={{fontSize:"0.9rem",lineHeight:1}} />
                          <span className="text-xs font-semibold" style={{color:"rgba(255,255,255,0.85)"}}>{team ?? "TBD"}</span>
                          <span className="text-xs font-black" style={{color:"#c8f000"}}>{pts}pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Below cut — locked out */}
                {belowCut.length > 0 && (
                  <div>
                    <p className="text-xs mb-1.5" style={{color:"rgba(255,255,255,0.2)",fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.08em"}}>Eliminated</p>
                    <div className="flex flex-wrap gap-1.5">
                      {belowCut.map(({ group: g, team, pts }) => (
                        <div key={g} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                          style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",opacity:0.45}}>
                          <span className={getFlagClass(team) ?? ''} style={{fontSize:"0.9rem",lineHeight:1}} />
                          <span className="text-xs font-semibold" style={{color:"rgba(255,255,255,0.5)"}}>{team ?? "TBD"}</span>
                          <span className="text-xs font-black" style={{color:"rgba(255,255,255,0.25)"}}>{pts}pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex flex-col gap-2">
            {GROUPS.map(g=>(
              <GroupCard key={g} group={g} picks={picks} scores={scores}
                onPick={handleGroupPick} onScore={handleGroupScore}
                standings={byGroup[g]} thirds={thirds} mode={mode}
                isOpen={openGroup===g}
                onToggle={()=>setOpenGroup(prev=>prev===g?null:g)}
                matchResults={matchResults}
                readOnly={readOnly || isSubmitted}
                assumptions={assumptions} onAssume={handleAssumption}
                onReorderStandings={order => setGroupOrderOverrides(prev => ({...prev, [g]: order}))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ══ SUBMIT BAR ══════════════════════════════════════════════════════ */}
      {!readOnly && <div className="mt-8 mb-2 flex items-center gap-4 flex-wrap p-5 rounded-2xl"
        style={{
          background: allPicked
            ? "linear-gradient(135deg, rgba(220,38,38,0.12), rgba(185,28,28,0.08))"
            : "rgba(255,255,255,0.03)",
          border: `1px solid ${allPicked ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.08)"}`,
        }}>

        <div className="flex-1 min-w-0">
          {isSubmitted ? (
            <>
              <p className="font-bold text-sm" style={{color:"#22c55e"}}>✓ Bracket Submitted</p>
              <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.7)"}}>
                Your official entry is locked in. Click "Edit Bracket" to make changes.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-sm text-white">
                {allPicked ? "Ready to submit! 🏆" : `${totalMatches - pickedCount} picks remaining`}
              </p>
              <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.65)"}}>
                {allPicked
                  ? "All available picks complete — lock in your bracket and compete with friends."
                  : `Complete all ${totalMatches} available group stage matches to submit your entry.`}
              </p>
              {submitStatus === "error" && (
                <p className="text-xs mt-1" style={{color:"#ef4444"}}>{submitError}</p>
              )}
            </>
          )}
        </div>

        {isSubmitted ? (
          <button
            onClick={handleWithdraw}
            className="shrink-0 px-6 py-3.5 rounded-xl font-black transition-all duration-150 active:scale-95"
            style={{
              fontSize: "1rem",
              background: "linear-gradient(135deg,#c8f000,#84cc16)",
              color: "#1a0533",
              boxShadow: "0 0 20px rgba(200,240,0,0.35)",
            }}
          >
            ✏️ EDIT BRACKET
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allPicked}
            className="shrink-0 px-6 py-3 rounded-xl font-black text-sm transition-all duration-150 active:scale-95"
            style={{
              background: !allPicked
                ? "rgba(255,255,255,0.06)"
                : submitting
                ? "rgba(220,38,38,0.4)"
                : "linear-gradient(135deg,#dc2626,#b91c1c)",
              color: !allPicked ? "rgba(255,255,255,0.25)" : "white",
              cursor: !allPicked ? "not-allowed" : "pointer",
              boxShadow: allPicked ? "0 0 24px rgba(220,38,38,0.4)" : "none",
            }}
          >
            {submitting ? "Submitting…" : user ? "Submit My Bracket" : "Sign In & Submit"}
            </button>
          )}
      </div>}

      {/* ══ KNOCKOUT BRACKET ════════════════════════════════════════════════ */}
      {view==="knockout"&&(
        <div>
          {unresolvedCount > 0 && !readOnly &&(
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
              style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)"}}>
              <span className="text-lg">⚠️</span>
              <p className="text-xs" style={{color:"rgba(255,255,255,0.5)"}}>
                <strong style={{color:"#f59e0b"}}>{unresolvedCount} group matches</strong> still unresolved (no pick, result, or assumed outcome) — unresolved teams show as TBD.
              </p>
              <button onClick={()=>setView("groups")}
                className="ml-auto px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap"
                style={{background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.3)",color:"#f59e0b"}}>
                ← Go to Groups
              </button>
            </div>
          )}

          {/* Bracket pick progress */}
          {!readOnly && (
          <div className="flex items-center gap-3 mb-6">
            <div className="h-1.5 rounded-full overflow-hidden"
              style={{background:"rgba(255,255,255,0.08)",width:160}}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{width:`${Math.round((bracketPicks/maxBracket)*100)}%`,
                  background:champion?"linear-gradient(90deg,#c8f000,#22c55e)":"linear-gradient(90deg,#c8f000,#84cc16)"}}/>
            </div>
            <span className="text-xs font-semibold" style={{color:champion?"#22c55e":"#c8f000"}}>
              {bracketPicks}/{maxBracket} bracket picks
            </span>
          </div>
          )}

          {/* Scrollable bracket */}
          <div className="overflow-x-auto pb-4" style={{WebkitOverflowScrolling:"touch"}}>
            <div className="flex gap-3" style={{minWidth:"max-content",height:BRACKET_H}}>

              {ROUNDS.map((round,ri)=>{
                const count=ROUND_COUNTS[round];
                const slotFlex=Math.pow(2,ri);
                return (
                  <div key={round} style={{width:180,display:"flex",flexDirection:"column"}}>
                    <div className="mb-2 text-center shrink-0">
                      <span className="text-xs font-bold uppercase tracking-widest"
                        style={{color:"#c8f000",opacity:0.8,fontSize:"0.6rem"}}>
                        {ROUND_LABELS[round]}
                      </span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",flex:1}}>
                      {Array.from({length:count},(_,i)=>{
                        const{home,away}=getTeams(round,i,bw,r32Slots);
                        const winner=bw[round][i];
                        const scoreKey=`${round}_${i}`;
                        const score=bScores[scoreKey]??null;
                        const label=getMatchLabel(round,i);
                        return (
                          <div key={i} style={{flex:slotFlex,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
                            <span style={{fontSize:"0.55rem",fontWeight:700,letterSpacing:"0.04em",color:"rgba(255,255,255,0.55)",textTransform:"uppercase",textAlign:"center",lineHeight:1}}>
                              {label}
                            </span>
                            <BracketMatch
                              home={home} away={away} winner={winner}
                              onPick={team=>handleBracketPick(round,i,team)}
                              onForcePick={team=>handleBracketForcePick(round,i,team)}
                              onScore={(h,a)=>handleBracketScore(scoreKey,h,a)}
                              score={score}
                              scoreMode={mode==="score"}
                              isFinal={round==="F"}
                              locked={isKoMatchLocked(round,i)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Champion */}
              <div style={{width:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div className="rounded-2xl p-5 text-center"
                  style={{background:champion?"linear-gradient(135deg,rgba(200,240,0,0.12),rgba(34,197,94,0.12))":"rgba(255,255,255,0.03)",
                    border:`1px solid ${champion?"rgba(200,240,0,0.35)":"rgba(255,255,255,0.07)"}`,width:140}}>
                  {champion?(
                    <>
                      <div className="text-3xl mb-2">🏆</div>
                      <span className={(getFlagClass(champion) ?? '') + ' mb-1'} style={{fontSize:'2rem',lineHeight:1,display:'inline-block'}} />
                      <p style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.2rem",letterSpacing:"0.04em",color:"#c8f000",lineHeight:1.1}}>
                        {champion}
                      </p>
                      <p className="text-xs mt-1.5 font-semibold" style={{color:"rgba(255,255,255,0.6)"}}>Your Champion</p>
                    </>
                  ):(
                    <>
                      <div className="text-3xl mb-2 opacity-30">🏆</div>
                      <p className="text-xs leading-tight" style={{color:"rgba(255,255,255,0.2)"}}>
                        Complete the bracket to crown a champion
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* 3rd Place — inline after champion, separated by a thin rule */}
              <div style={{width:1,alignSelf:"stretch",background:"rgba(255,255,255,0.07)",margin:"0 4px",flexShrink:0}}/>
              <div style={{width:192,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
                <div className="flex items-center gap-2 w-full">
                  <div className="h-px flex-1" style={{background:"rgba(255,255,255,0.07)"}}/>
                  <span style={{color:"#94a3b8",fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",whiteSpace:"nowrap"}}>
                    🥉 3rd Place
                  </span>
                  <div className="h-px flex-1" style={{background:"rgba(255,255,255,0.07)"}}/>
                </div>
                {sf1Loser&&sf2Loser ? (
                  <>
                    <BracketMatch
                      home={sf1Loser} away={sf2Loser}
                      winner={bw["3P"][0]}
                      onPick={handle3PPick}
                      onForcePick={handle3PForcePick}
                      onScore={handle3PScore}
                      score={bScores["3P_0"]??null}
                      scoreMode={mode==="score"}
                      isFinal={false}
                      locked={isKoMatchLocked("3P",0)}
                    />
                    {bw["3P"][0]&&(
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{background:"rgba(148,163,184,0.08)",border:"1px solid rgba(148,163,184,0.18)"}}>
                        <span className={getFlagClass(bw["3P"][0]) ?? ''} style={{fontSize:'1.3rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
                        <div>
                          <p className="font-black leading-none" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",letterSpacing:"0.04em",color:"#94a3b8"}}>
                            {bw["3P"][0]}
                          </p>
                          <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.55)"}}>3rd Place 🥉</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl px-4 py-5 text-center"
                    style={{background:"rgba(255,255,255,0.03)",border:"1px dashed rgba(255,255,255,0.09)",width:172}}>
                    <span className="text-2xl opacity-30">🥉</span>
                    <p className="text-xs mt-2 leading-snug" style={{color:"rgba(255,255,255,0.2)"}}>
                      Pick your semi-final winners to unlock
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-5 mt-6" style={{maxWidth:800}}>
            {(mode==="winner"
              ?["Click a team to advance them","Click again to undo","Changing a pick clears later rounds"]
              :["Enter goals — winner is auto-advanced","Equal scores? Pick the penalties winner","Bracket cascades automatically"]
            ).map(label=>(
              <div key={label} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{background:"rgba(200,240,0,0.5)"}}/>
                <span className="text-xs" style={{color:"rgba(255,255,255,0.6)"}}>{label}</span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>

      {/* ══ SUBMISSION CONFIRMATION OVERLAY ════════════════════════════════ */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,2,26,0.95)", backdropFilter: "blur(12px)" }}>
          <div className="w-full max-w-sm rounded-2xl p-10 text-center"
            style={{
              background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
              border: "1px solid rgba(200,240,0,0.2)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
            }}>
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>
              Official Entry
            </p>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
              Bracket Submitted!
            </h2>
            <p className="text-sm mt-3 mb-6" style={{ color: "rgba(255,255,255,0.7)" }}>
              Your picks are locked in. Good luck!
            </p>
            {champion && (
              <div className="mb-6 px-4 py-3 rounded-xl" style={{ background: "rgba(200,240,0,0.06)", border: "1px solid rgba(200,240,0,0.15)" }}>
                <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.65)" }}>Your Champion</p>
                <p className="font-black text-lg" style={{ color: "#c8f000", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>
                  {champion}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowConfirmation(false); onNavigate ? onNavigate("leaderboard") : onBack?.(); }}
                className="w-full py-3 rounded-xl font-black text-sm"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
                View Leaderboard
              </button>
              <button
                onClick={() => { setShowConfirmation(false); handleWithdraw(); }}
                className="w-full py-3 rounded-xl font-black text-sm"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
                Edit Bracket
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes editPulse {
          0%, 100% { box-shadow: 0 0 24px rgba(200,240,0,0.45), 0 6px 20px rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 0 44px rgba(200,240,0,0.8),  0 6px 20px rgba(0,0,0,0.4); }
        }
      `}</style>
    </>
  );
}
