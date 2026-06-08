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
import { supabase } from "../lib/supabase";
import { useAuth }  from "../hooks/useAuth";
import AuthModal    from "../components/AuthModal";
import { useTeamModal } from "../context/TeamModalContext";
import { getFlagClass } from '../utils/flags';

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUPS        = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const GROUP_MATCHES = fixtures;
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

function MatchPickRow({ match, pick, score, onPickChange, onScoreChange, mode }) {
  const { home, away, matchday } = match;
  const { openTeam } = useTeamModal();
  const hVal = score?.home??0, aVal = score?.away??0;
  const hasScore = score!=null;
  const homeW = mode==="score" ? (hasScore&&hVal>aVal) : pick==="home";
  const awayW = mode==="score" ? (hasScore&&aVal>hVal) : pick==="away";
  const drawV = mode==="score" ? (hasScore&&hVal===aVal) : pick==="draw";

  const nameColor = (win,draw) =>
    win ? "#c8f000" : draw ? "#f59e0b" : "rgba(255,255,255,0.75)";

  const teamNameStyle = (color) => ({color, cursor:"pointer", textDecoration:"underline", textDecorationColor:"transparent", textUnderlineOffset:2});
  const teamHover = e => { e.currentTarget.style.textDecorationColor = "currentColor"; };
  const teamLeave = e => { e.currentTarget.style.textDecorationColor = "transparent"; };

  if (mode==="score") {
    return (
      <div className="flex items-center gap-1.5 py-2 px-3">
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          <span className="text-xs font-semibold truncate text-right"
            style={teamNameStyle(nameColor(homeW,drawV))}
            onClick={()=>openTeam(home)} onMouseEnter={teamHover} onMouseLeave={teamLeave}>{home}</span>
          <span className={getFlagClass(home) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ScorePicker value={hVal} onChange={v=>{onScoreChange(match.id,v,aVal);onPickChange(match.id,scoreToResult(v,aVal));}} />
          <span className="font-black text-sm" style={{color:"rgba(255,255,255,0.25)"}}>–</span>
          <ScorePicker value={aVal} onChange={v=>{onScoreChange(match.id,hVal,v);onPickChange(match.id,scoreToResult(hVal,v));}} />
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className={getFlagClass(away) ?? ''} style={{fontSize:'1.2rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
          <span className="text-xs font-semibold truncate"
            style={teamNameStyle(nameColor(awayW,drawV))}
            onClick={()=>openTeam(away)} onMouseEnter={teamHover} onMouseLeave={teamLeave}>{away}</span>
        </div>
        <span style={{color:"rgba(255,255,255,0.18)",fontSize:"0.6rem",flexShrink:0}}>MD{matchday}</span>
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
    </div>
  );
}

// ── Group stage: mini standings ───────────────────────────────────────────────

function MiniStandings({ standings, thirds }) {
  const thirdTeams=new Set(thirds.map(t=>t.team));
  const { openTeam } = useTeamModal();
  return (
    <div className="pt-2 mt-2" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
      {standings.map((t,i)=>{
        const q=i<2, t3=i===2&&thirdTeams.has(t.team);
        return (
          <div key={t.team} className="flex items-center gap-2 px-3 py-1">
            <span className="text-xs w-3 shrink-0" style={{color:"rgba(255,255,255,0.25)"}}>{i+1}</span>
            <span className={getFlagClass(t.team) ?? ''} style={{fontSize:'1rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
            <span className="text-xs flex-1 font-semibold truncate"
              style={{color:q?"#c8f000":t3?"#f59e0b":"rgba(255,255,255,0.35)",cursor:"pointer"}}
              onClick={()=>openTeam(t.team)}>
              {t.team}
            </span>
            {(q||t3)&&(
              <span className="text-xs px-1 rounded shrink-0"
                style={{background:q?"rgba(200,240,0,0.12)":"rgba(245,158,11,0.12)",color:q?"#c8f000":"#f59e0b",fontSize:"0.6rem",fontWeight:700}}>
                {q?"Q":"3rd"}
              </span>
            )}
            <div className="flex gap-2 shrink-0 text-xs" style={{color:"rgba(255,255,255,0.3)"}}>
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

function GroupCard({ group, picks, scores, onPick, onScore, standings, thirds, mode, isOpen, onToggle }) {
  const matches=GROUP_MATCHES.filter(m=>m.group===group);
  const picked=matches.filter(m=>picks[m.id]).length;
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
            style={{color:"rgba(255,255,255,0.3)",transform:isOpen?"rotate(180deg)":"rotate(0deg)"}}
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
                  onPickChange={onPick} onScoreChange={onScore} mode={mode} />
              ))}
            </div>
          ))}
          <MiniStandings standings={standings} thirds={thirds}/>
        </div>
      )}
    </div>
  );
}

// ── Knockout: bracket match card ──────────────────────────────────────────────

function BracketMatch({ home, away, winner, onPick, onForcePick, onScore, score, scoreMode, isFinal }) {
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
      <button onClick={()=>team&&onPick(team)} disabled={isTbd}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-all duration-100 active:scale-95"
        style={{background:isW?"rgba(200,240,0,0.15)":"transparent",cursor:isTbd?"default":"pointer",opacity:isL?0.3:1}}>
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
    <div className="rounded-xl overflow-hidden"
      style={{width:168,background:winner?"rgba(200,240,0,0.06)":"rgba(255,255,255,0.04)",
        border:`1px solid ${isFinal&&winner?"rgba(200,240,0,0.45)":winner?"rgba(200,240,0,0.2)":"rgba(255,255,255,0.09)"}`,
        boxShadow:isFinal&&winner?"0 0 24px rgba(200,240,0,0.15)":"none"}}>
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
      <span className="text-xs font-semibold uppercase tracking-widest" style={{color:"rgba(255,255,255,0.35)"}}>
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

// ── Lock date: World Cup kick-off ─────────────────────────────────────────────
const WC_KICKOFF = new Date("2026-06-11T19:00:00-05:00");
const isTournamentStarted = () => new Date() >= WC_KICKOFF;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyBracket({ bracketData, onBack, readOnly = false, viewingUser = null }) {
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

  const isLocked = isTournamentStarted();

  const { user, loading: authLoading, signOut } = useAuth();
  const [showAuth,      setShowAuth]      = useState(false);
  const [authModalMode, setAuthModalMode] = useState("login");
  const [skippedAuth,   setSkippedAuth]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // null | "success" | "error"
  const [submitError,  setSubmitError]  = useState(null);
  const autoSaveRef = useRef(null);
  const leagueLinkedRef = useRef(false);
  const restoredRef = useRef(false);

  // Show welcome prompt if not logged in and hasn't skipped yet
  const showWelcome = !readOnly && !authLoading && !user && !skippedAuth;

  // On first login: if localStorage is empty, restore picks from Supabase
  useEffect(() => {
    if (!user || restoredRef.current || readOnly) return;
    restoredRef.current = true;
    if (Object.keys(picks).length > 0) return;
    supabase.from("submissions").select("picks,scores,bracket,bracket_scores")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data || Object.keys(data.picks ?? {}).length === 0) return;
        setPicks(data.picks);
        setScores(data.scores ?? {});
        setBw({ ...emptyWinners(), ...(data.bracket ?? {}) });
        setBScores(data.bracket_scores ?? {});
        if (bracketData) {
          upsertBracket({ ...bracketData, picks: data.picks, scores: data.scores ?? {},
            bracket: data.bracket ?? null, bracketScores: data.bracket_scores ?? {} });
        }
      });
  }, [user]);

  // Auto-save to Supabase (debounced 1.5s) whenever picks change and user is logged in
  useEffect(() => {
    if (!user || isLocked || readOnly) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      const hasData = Object.keys(picks).length > 0 || Object.values(bw).some(arr => Array.isArray(arr) && arr.some(Boolean));
      if (!hasData) return;
      await supabase.from("submissions").upsert({
        user_id:           user.id,
        email:             user.email,
        display_name:      user.user_metadata?.display_name ?? "",
        mode,
        picks,
        scores,
        bracket:           bw,
        bracket_scores:    bScores,
        group_picks_count: Object.keys(picks).length,
        updated_at:        new Date().toISOString(),
      }, { onConflict: "user_id" });

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
  }, [picks, scores, bw, bScores, user]);

  // Persist the whole bracket object to localStorage whenever anything changes
  function save(newPicks, newScores, newBw, newBScores) {
    if (!bracketData || isLocked || readOnly) return;
    upsertBracket({ ...bracketData, picks: newPicks, scores: newScores, bracket: newBw, bracketScores: newBScores });
  }

  async function handleSubmit() {
    if (!user) { setShowAuth(true); return; }
    if (isLocked) return;
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
        group_picks_count: Object.keys(picks).length,
        updated_at:        new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      setSubmitStatus("success");
    } catch (err) {
      setSubmitError(err.message);
      setSubmitStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  const { byGroup, thirds, r32Slots } = useMemo(()=>{
    const byGroup=computeAllStandings(picks);
    const thirds=computeThirds(byGroup);
    return { byGroup, thirds, r32Slots:buildR32Slots(byGroup,thirds,picks) };
  },[picks]);

  const pickedCount  = Object.keys(picks).length;
  const totalMatches = GROUP_MATCHES.length;
  const allPicked    = pickedCount===totalMatches;

  // SF losers for 3rd place
  const sf1Loser = getSFLoser(0,bw,r32Slots);
  const sf2Loser = getSFLoser(1,bw,r32Slots);

  // Pick counts
  const bracketPicks = ROUNDS.reduce((s,r)=>s+bw[r].filter(Boolean).length,0) + (bw["3P"][0]?1:0);
  const maxBracket   = 31+1; // 31 rounds + 3rd place

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleGroupPick(matchId, pick) {
    if (isLocked || readOnly) return;
    const newPicks = {...picks, [matchId]: pick};
    const fresh = emptyWinners();
    setPicks(newPicks);
    setBw(fresh);
    setBScores({});
    save(newPicks, scores, fresh, {});
  }

  function handleGroupScore(matchId, h, a) {
    if (isLocked || readOnly) return;
    const newScores = {...scores, [matchId]:{home:h,away:a}};
    setScores(newScores);
    save(picks, newScores, bw, bScores);
  }

  function handleBracketPick(round, matchIdx, team) {
    if (isLocked || readOnly) return;
    const next=applyPick(bw,round,matchIdx,team,false);
    setBw(next); save(picks, scores, next, bScores);
  }

  function handleBracketForcePick(round, matchIdx, team) {
    if (isLocked || readOnly) return;
    const next=applyPick(bw,round,matchIdx,team,true);
    setBw(next); save(picks, scores, next, bScores);
  }

  function handleBracketScore(scoreKey, h, a) {
    if (isLocked || readOnly) return;
    const newBs = {...bScores, [scoreKey]:{home:h,away:a}};
    setBScores(newBs);
    save(picks, scores, bw, newBs);
  }

  function handle3PPick(team) {
    if (isLocked || readOnly) return;
    const next={...bw,"3P":[team===bw["3P"][0]?null:team]};
    setBw(next); save(picks, scores, next, bScores);
  }

  function handle3PScore(h, a) {
    if (isLocked || readOnly) return;
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
    if (isLocked) return;
    if (bw["3P"][0] === team) return;
    const next={...bw,"3P":[team]};
    setBw(next); save(picks, scores, next, bScores);
  }

  function handleResetAll() {
    if (isLocked) return;
    const fresh = emptyWinners();
    setPicks({}); setScores({}); setBw(fresh); setBScores({});
    save({}, {}, fresh, {});
  }

  const champion=bw.F[0];
  const SLOT_H=80, BRACKET_H=16*SLOT_H;

  return (
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
          ) : (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{background: isLocked ? "rgba(239,68,68,0.12)" : "rgba(200,240,0,0.1)", color: isLocked ? "#ef4444" : "#c8f000", border: isLocked ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(200,240,0,0.2)"}}>
              {isLocked ? "🔒 Locked" : "Auto-saved"}
            </span>
          )}
        </div>
      )}

      {/* ── Tournament locked banner ── */}
      {isLocked && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-xl"
          style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)"}}>
          <span className="text-xl">🔒</span>
          <div>
            <p className="font-bold text-sm" style={{color:"#ef4444"}}>Bracket Locked</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>
              The World Cup has started — picks are now read-only. Your submitted bracket is saved to your account.
            </p>
          </div>
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
              $1,000 Challenge
            </p>
            <h3 className="text-white mb-2 leading-none"
              style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2rem",letterSpacing:"0.04em"}}>
              Make My Bracket
            </h3>
            <p className="text-sm mb-6" style={{color:"rgba(255,255,255,0.45)"}}>
              Sign in to save your predictions and enter the $1,000 group stage challenge.
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
                style={{color:"rgba(255,255,255,0.25)"}}
                onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.5)"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.25)"}>
                Skip for now — I'll sign in before submitting
              </button>
            </div>
          </div>
        </div>
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
          {user && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full font-semibold"
                style={{background:"rgba(200,240,0,0.1)",border:"1px solid rgba(200,240,0,0.2)",color:"#c8f000"}}>
                ✓ {user.user_metadata?.display_name || user.email}
              </span>
              <button onClick={signOut}
                style={{color:"rgba(255,255,255,0.3)"}}
                onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.6)"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.3)"}>
                Sign out
              </button>
            </div>
          )}
        </div>
        <p className="text-sm mb-4" style={{color:"rgba(255,255,255,0.35)"}}>
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
            style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.45)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.1)";e.currentTarget.style.color="rgba(255,255,255,0.7)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="rgba(255,255,255,0.45)";}}>
            ↺ Reset all
          </button>
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

      {/* ══ GROUP STAGE ══════════════════════════════════════════════════════ */}
      {view==="groups"&&(
        <div>
          {allPicked && !readOnly &&(
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
              style={{background:"rgba(200,240,0,0.06)",border:"1px solid rgba(200,240,0,0.2)"}}>
              <span className="text-lg">✅</span>
              <div>
                <p className="text-sm font-bold" style={{color:"#c8f000"}}>All group picks complete!</p>
                <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.45)"}}>
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

          <div className="flex flex-col gap-2">
            {GROUPS.map(g=>(
              <GroupCard key={g} group={g} picks={picks} scores={scores}
                onPick={handleGroupPick} onScore={handleGroupScore}
                standings={byGroup[g]} thirds={thirds} mode={mode}
                isOpen={openGroup===g}
                onToggle={()=>setOpenGroup(prev=>prev===g?null:g)}
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
          {isLocked ? (
            <>
              <p className="font-bold text-sm" style={{color:"#ef4444"}}>🔒 Bracket Locked</p>
              <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>
                The World Cup has started. Your picks are saved to your account and can be viewed in leagues.
              </p>
            </>
          ) : submitStatus === "success" ? (
            <>
              <p className="font-bold text-sm" style={{color:"#c8f000"}}>🎉 Bracket submitted!</p>
              <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>
                Your picks are saved. You can update them any time before the tournament starts.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-sm text-white">
                {allPicked ? "Ready to submit! 🏆" : `${totalMatches - pickedCount} picks remaining`}
              </p>
              <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.35)"}}>
                {allPicked
                  ? "All group stage picks complete — lock in your bracket to enter the $1,000 challenge."
                  : "Complete all 48 group stage matches to submit your official entry."}
              </p>
              {submitStatus === "error" && (
                <p className="text-xs mt-1" style={{color:"#ef4444"}}>{submitError}</p>
              )}
            </>
          )}
        </div>

        {!isLocked && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allPicked}
            className="shrink-0 px-6 py-3 rounded-xl font-black text-sm transition-all duration-150 active:scale-95"
            style={{
              background: !allPicked
                ? "rgba(255,255,255,0.06)"
                : submitting
                ? "rgba(220,38,38,0.4)"
                : submitStatus === "success"
                ? "linear-gradient(135deg,#c8f000,#84cc16)"
                : "linear-gradient(135deg,#dc2626,#b91c1c)",
              color: !allPicked
                ? "rgba(255,255,255,0.25)"
                : submitStatus === "success"
                ? "#1a0533"
                : "white",
              cursor: !allPicked ? "not-allowed" : "pointer",
              boxShadow: allPicked && submitStatus !== "success"
                ? "0 0 24px rgba(220,38,38,0.4)"
                : "none",
            }}
          >
            {submitting
              ? "Saving…"
              : submitStatus === "success"
              ? "✓ Saved"
              : user
              ? "Submit My Bracket"
              : "Sign In & Submit"}
          </button>
        )}
      </div>}

      {/* ══ KNOCKOUT BRACKET ════════════════════════════════════════════════ */}
      {view==="knockout"&&(
        <div>
          {!allPicked && !readOnly &&(
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
              style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)"}}>
              <span className="text-lg">⚠️</span>
              <p className="text-xs" style={{color:"rgba(255,255,255,0.5)"}}>
                <strong style={{color:"#f59e0b"}}>{totalMatches-pickedCount} group matches</strong> still unpicked — unresolved teams show as TBD.
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
                            <span style={{fontSize:"0.55rem",fontWeight:700,letterSpacing:"0.04em",color:"rgba(255,255,255,0.25)",textTransform:"uppercase",textAlign:"center",lineHeight:1}}>
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
                      <p className="text-xs mt-1.5 font-semibold" style={{color:"rgba(255,255,255,0.3)"}}>Your Champion</p>
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
                    />
                    {bw["3P"][0]&&(
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{background:"rgba(148,163,184,0.08)",border:"1px solid rgba(148,163,184,0.18)"}}>
                        <span className={getFlagClass(bw["3P"][0]) ?? ''} style={{fontSize:'1.3rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
                        <div>
                          <p className="font-black leading-none" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",letterSpacing:"0.04em",color:"#94a3b8"}}>
                            {bw["3P"][0]}
                          </p>
                          <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.25)"}}>3rd Place 🥉</p>
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
                <span className="text-xs" style={{color:"rgba(255,255,255,0.3)"}}>{label}</span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
