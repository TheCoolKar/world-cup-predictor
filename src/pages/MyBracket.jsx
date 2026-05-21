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

import { useState, useMemo }  from "react";
import fixtures                from "../data/wc2026_fixtures.json";
import eloRatings              from "../data/elo_ratings.json";
import {
  getPicks,         setPick,         clearPicks,
  getScores,        setScore,        clearScores,
  getBracket,       saveBracket,     clearBracket,
  getBracketScores, setBracketScore, clearBracketScores,
} from "../utils/storage";

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

// ── Flag helper ───────────────────────────────────────────────────────────────

const FLAG_CODES = {
  "Mexico":"mx","South Africa":"za","South Korea":"kr","Czechia":"cz",
  "Canada":"ca","Qatar":"qa","Switzerland":"ch","Bosnia and Herzegovina":"ba",
  "Brazil":"br","Morocco":"ma","Haiti":"ht","Scotland":"gb-sct",
  "USA":"us","Paraguay":"py","Australia":"au","Türkiye":"tr",
  "Germany":"de","Curaçao":"cw","Ivory Coast":"ci","Ecuador":"ec",
  "Netherlands":"nl","Japan":"jp","Sweden":"se","Tunisia":"tn",
  "Belgium":"be","Egypt":"eg","Iran":"ir","New Zealand":"nz",
  "Spain":"es","Cape Verde":"cv","Saudi Arabia":"sa","Uruguay":"uy",
  "France":"fr","Senegal":"sn","Norway":"no","Iraq":"iq",
  "Argentina":"ar","Algeria":"dz","Austria":"at","Jordan":"jo",
  "Portugal":"pt","DR Congo":"cd","Uzbekistan":"uz","Colombia":"co",
  "England":"gb-eng","Croatia":"hr","Ghana":"gh","Panama":"pa","Nigeria":"ng",
};

function getFlag(name) {
  if (!name) return "";
  const code = FLAG_CODES[name];
  if (!code) return "🏳️";
  if (code === "gb-sct") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
  if (code === "gb-eng") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  return code.toUpperCase().split("").map(c =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  ).join("");
}

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

// ── R32 slot builder ──────────────────────────────────────────────────────────

function buildR32Slots(byGroup, thirds) {
  const pos=(g,i)=>byGroup[g]?.[i]?.team??null;
  const t=i=>thirds[i]?.team??null;
  const pairs=[["A","B"],["C","D"],["E","F"],["G","H"],["I","J"],["K","L"]];
  const slots=[];
  for (const [g1,g2] of pairs) {
    slots.push({home:pos(g1,0),away:pos(g2,1)});
    slots.push({home:pos(g2,0),away:pos(g1,1)});
  }
  slots.push({home:t(0),away:t(7)},{home:t(1),away:t(6)},{home:t(2),away:t(5)},{home:t(3),away:t(4)});
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

/**
 * Apply a bracket pick with optional force (score mode bypasses toggle).
 * Always cascades the old winner out of subsequent rounds.
 */
function applyPick(prev, round, matchIdx, team, force=false) {
  const next={};
  for (const k of ROUNDS) next[k]=[...prev[k]];
  next["3P"]=[...prev["3P"]];
  const old = next[round][matchIdx];

  if (!force && team===old) {
    // Toggle off
    next[round][matchIdx]=null;
  } else {
    if (force && old===team) return prev; // no-op
    next[round][matchIdx]=team;
  }

  // Cascade: clear old winner from all later rounds in the main chain
  if (old) {
    let ri=ROUNDS.indexOf(round)+1, mi=Math.floor(matchIdx/2);
    while (ri<ROUNDS.length) {
      const r=ROUNDS[ri];
      if (next[r][mi]===old) { next[r][mi]=null; mi=Math.floor(mi/2); ri++; } else break;
    }
  }
  return next;
}

function getTeams(round, matchIdx, winners, r32Slots) {
  if (round==="R32") { const s=r32Slots[matchIdx]??{}; return{home:s.home??null,away:s.away??null}; }
  const prev=ROUNDS[ROUNDS.indexOf(round)-1];
  return{home:winners[prev]?.[matchIdx*2]??null,away:winners[prev]?.[matchIdx*2+1]??null};
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
  const hVal = score?.home??0, aVal = score?.away??0;
  const hasScore = score!=null;
  const homeW = mode==="score" ? (hasScore&&hVal>aVal) : pick==="home";
  const awayW = mode==="score" ? (hasScore&&aVal>hVal) : pick==="away";
  const drawV = mode==="score" ? (hasScore&&hVal===aVal) : pick==="draw";

  const nameColor = (win,draw) =>
    win ? "#c8f000" : draw ? "#f59e0b" : "rgba(255,255,255,0.75)";

  if (mode==="score") {
    return (
      <div className="flex items-center gap-1.5 py-2 px-3">
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          <span className="text-xs font-semibold truncate text-right" style={{color:nameColor(homeW,drawV)}}>{home}</span>
          <span className="text-base leading-none shrink-0">{getFlag(home)}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ScorePicker value={hVal} onChange={v=>{onScoreChange(match.id,v,aVal);onPickChange(match.id,scoreToResult(v,aVal));}} />
          <span className="font-black text-sm" style={{color:"rgba(255,255,255,0.25)"}}>–</span>
          <ScorePicker value={aVal} onChange={v=>{onScoreChange(match.id,hVal,v);onPickChange(match.id,scoreToResult(hVal,v));}} />
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-base leading-none shrink-0">{getFlag(away)}</span>
          <span className="text-xs font-semibold truncate" style={{color:nameColor(awayW,drawV)}}>{away}</span>
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
        <span className="text-xs font-semibold truncate text-right" style={{color:homeW?"#c8f000":"rgba(255,255,255,0.75)"}}>{home}</span>
        <span className="text-base leading-none shrink-0">{getFlag(home)}</span>
      </div>
      <div className="flex gap-1 shrink-0">
        <BTN value="home" label="1" activeColor="#c8f000"  activeText="#1a0533"/>
        <BTN value="draw" label="X" activeColor="#f59e0b"  activeText="#1a0533"/>
        <BTN value="away" label="2" activeColor="#ef4444"  activeText="white"  />
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-base leading-none shrink-0">{getFlag(away)}</span>
        <span className="text-xs font-semibold truncate" style={{color:awayW?"#ef4444":"rgba(255,255,255,0.75)"}}>{away}</span>
      </div>
      <span style={{color:"rgba(255,255,255,0.18)",fontSize:"0.6rem",flexShrink:0}}>MD{matchday}</span>
    </div>
  );
}

// ── Group stage: mini standings ───────────────────────────────────────────────

function MiniStandings({ standings, thirds }) {
  const thirdTeams=new Set(thirds.map(t=>t.team));
  return (
    <div className="pt-2 mt-2" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
      {standings.map((t,i)=>{
        const q=i<2, t3=i===2&&thirdTeams.has(t.team);
        return (
          <div key={t.team} className="flex items-center gap-2 px-3 py-1">
            <span className="text-xs w-3 shrink-0" style={{color:"rgba(255,255,255,0.25)"}}>{i+1}</span>
            <span className="text-sm leading-none shrink-0">{getFlag(t.team)}</span>
            <span className="text-xs flex-1 font-semibold truncate"
              style={{color:q?"#c8f000":t3?"#f59e0b":"rgba(255,255,255,0.35)"}}>
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

function GroupCard({ group, picks, scores, onPick, onScore, standings, thirds, mode }) {
  const matches=GROUP_MATCHES.filter(m=>m.group===group);
  const picked=matches.filter(m=>picks[m.id]).length;
  const done=picked===matches.length;
  const byDay={};
  for (const m of matches) { if(!byDay[m.matchday])byDay[m.matchday]=[]; byDay[m.matchday].push(m); }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{border:`1px solid ${done?"rgba(200,240,0,0.2)":"rgba(255,255,255,0.07)"}`,background:done?"rgba(200,240,0,0.02)":"rgba(255,255,255,0.03)"}}>
      <div className="flex items-center justify-between px-3 py-2"
        style={{borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.04)"}}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{background:done?"linear-gradient(135deg,#c8f000,#84cc16)":"rgba(255,255,255,0.1)"}}>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.75rem",color:done?"#1a0533":"rgba(255,255,255,0.7)"}}>
              {group}
            </span>
          </div>
          <span className="text-xs font-bold text-white">Group {group}</span>
        </div>
        <span className="text-xs font-semibold" style={{color:done?"#c8f000":"rgba(255,255,255,0.3)"}}>
          {picked}/{matches.length}
        </span>
      </div>
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
  );
}

// ── Knockout: bracket match card ──────────────────────────────────────────────

function BracketMatch({ home, away, winner, onPick, onForcePick, onScore, score, scoreMode, isFinal }) {
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
          <span className="text-sm leading-none shrink-0" style={{minWidth:20}}>{home?getFlag(home):""}</span>
          <span className="text-xs font-semibold truncate flex-1" style={{color:effectiveWinner===home?"#c8f000":!home?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.8)"}}>
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
          <span className="text-sm leading-none shrink-0" style={{minWidth:20}}>{away?getFlag(away):""}</span>
          <span className="text-xs font-semibold truncate flex-1" style={{color:effectiveWinner===away?"#c8f000":!away?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.8)"}}>
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
        <span className="text-sm leading-none shrink-0" style={{minWidth:20}}>{isTbd?"":getFlag(team)}</span>
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
          ? "Group: 1=home · X=draw · 2=away  |  Bracket: click to advance"
          : "Enter goals for each team — result and winner are auto-determined"}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyBracket() {
  const [view,   setView]   = useState("groups");
  const [mode,   setMode]   = useState("winner");
  const [picks,  setPicks]  = useState(()=>getPicks());
  const [scores, setScores] = useState(()=>getScores());
  const [bw,     setBw]     = useState(()=>{
    const saved = getBracket();
    if (!saved) return emptyWinners();
    // Merge with emptyWinners so any keys missing from older saves (e.g. "3P")
    // are always present — prevents TypeError crashes on legacy localStorage data.
    return { ...emptyWinners(), ...saved };
  });
  const [bScores,setBScores]= useState(()=>getBracketScores());

  const { byGroup, thirds, r32Slots } = useMemo(()=>{
    const byGroup=computeAllStandings(picks);
    const thirds=computeThirds(byGroup);
    return { byGroup, thirds, r32Slots:buildR32Slots(byGroup,thirds) };
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
    setPick(matchId,pick);
    setPicks(prev=>({...prev,[matchId]:pick}));
    const fresh=emptyWinners();
    setBw(fresh); saveBracket(fresh);
    setBScores({}); clearBracketScores();
  }

  function handleGroupScore(matchId, h, a) {
    setScore(matchId,h,a);
    setScores(prev=>({...prev,[matchId]:{home:h,away:a}}));
  }

  function handleBracketPick(round, matchIdx, team) {
    const next=applyPick(bw,round,matchIdx,team,false);
    setBw(next); saveBracket(next);
  }

  function handleBracketForcePick(round, matchIdx, team) {
    const next=applyPick(bw,round,matchIdx,team,true);
    setBw(next); saveBracket(next);
  }

  function handleBracketScore(scoreKey, h, a) {
    setBracketScore(scoreKey,h,a);
    setBScores(prev=>({...prev,[scoreKey]:{home:h,away:a}}));
  }

  function handle3PPick(team) {
    const next={...bw,"3P":[team===bw["3P"][0]?null:team]};
    setBw(next); saveBracket(next);
  }

  function handle3PScore(h, a) {
    const key="3P_0";
    setBracketScore(key,h,a);
    setBScores(prev=>({...prev,[key]:{home:h,away:a}}));
    if (sf1Loser&&sf2Loser&&h!==a) {
      const winner=h>a?sf1Loser:sf2Loser;
      const next={...bw,"3P":[winner]};
      setBw(next); saveBracket(next);
    }
  }

  function handle3PForcePick(team) {
    if (bw["3P"][0] === team) return; // no-op — already set
    const next={...bw,"3P":[team]};
    setBw(next); saveBracket(next);
  }

  function handleResetAll() {
    clearPicks(); clearScores(); clearBracket(); clearBracketScores();
    setPicks({}); setScores({}); setBw(emptyWinners()); setBScores({});
  }

  const champion=bw.F[0];
  const SLOT_H=80, BRACKET_H=16*SLOT_H;

  return (
    <div className="px-4 py-10" style={{maxWidth:"100vw"}}>

      {/* Header */}
      <div className="mb-6" style={{maxWidth:860}}>
        <h2 className="text-white mb-1"
          style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2rem",letterSpacing:"0.08em"}}>
          My Bracket
        </h2>
        <p className="text-sm mb-4" style={{color:"rgba(255,255,255,0.35)"}}>
          Predict all 72 group matches then pick your way through the knockout bracket.
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
          <ModeToggle mode={mode} onChange={setMode}/>

          {allPicked&&(
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {GROUPS.map(g=>(
              <GroupCard key={g} group={g} picks={picks} scores={scores}
                onPick={handleGroupPick} onScore={handleGroupScore}
                standings={byGroup[g]} thirds={thirds} mode={mode}/>
            ))}
          </div>
        </div>
      )}

      {/* ══ KNOCKOUT BRACKET ════════════════════════════════════════════════ */}
      {view==="knockout"&&(
        <div>
          <ModeToggle mode={mode} onChange={setMode}/>

          {!allPicked&&(
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
                        return (
                          <div key={i} style={{flex:slotFlex,display:"flex",alignItems:"center",justifyContent:"center"}}>
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
                      <div className="text-2xl mb-1">{getFlag(champion)}</div>
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
                        <span className="text-lg leading-none">{getFlag(bw["3P"][0])}</span>
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
