import { useState } from "react";
import { getFlagClass } from '../utils/flags';
import eloRatings from "../data/elo_ratings.json";
import fixtures   from "../data/wc2026_fixtures.json";
import { useTeamModal } from "../context/TeamModalContext";

// Build group map from fixtures
const GROUP_MAP = {};
for (const m of fixtures) {
  GROUP_MAP[m.home] = m.group;
  GROUP_MAP[m.away] = m.group;
}

const ELO_ENTRIES = Object.entries(eloRatings)
  .filter(([k]) => !k.startsWith("_"))
  .sort((a, b) => b[1] - a[1]);

const ALL_TEAMS = ELO_ENTRIES.map(([name, elo], i) => ({
  name,
  elo,
  rank: i + 1,
  group: GROUP_MAP[name] ?? "?",
}));

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export default function Teams() {
  const { openTeam } = useTeamModal();
  const [view, setView]   = useState("elo"); // "elo" | "group"
  const [search, setSearch] = useState("");

  const filtered = ALL_TEAMS.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = view === "elo"
    ? filtered
    : [...filtered].sort((a, b) => a.group.localeCompare(b.group) || a.rank - b.rank);

  const byGroup = {};
  if (view === "group") {
    for (const t of sorted) {
      if (!byGroup[t.group]) byGroup[t.group] = [];
      byGroup[t.group].push(t);
    }
  }

  const eloMax = ELO_ENTRIES[0]?.[1] ?? 2000;
  const eloMin = ELO_ENTRIES[ELO_ENTRIES.length - 1]?.[1] ?? 1200;

  function TeamCard({ team }) {
    const pct = Math.round(((team.elo - eloMin) / (eloMax - eloMin)) * 100);
    const tier =
      team.rank <= 8  ? { label: "Elite",  color: "#fbbf24" } :
      team.rank <= 16 ? { label: "Strong", color: "#c8f000" } :
      team.rank <= 28 ? { label: "Mid",    color: "#60a5fa" } :
                        { label: "Lower",  color: "rgba(255,255,255,0.3)" };

    return (
      <button
        onClick={() => openTeam(team.name)}
        className="w-full text-left rounded-xl p-3 flex items-center gap-3 transition-all duration-150 group"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "rgba(200,240,0,0.06)";
          e.currentTarget.style.border = "1px solid rgba(200,240,0,0.2)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
        }}
      >
        {/* Rank */}
        <span className="text-xs font-black shrink-0 w-6 text-right tabular-nums"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          {team.rank}
        </span>

        {/* Flag */}
        <span className={getFlagClass(team.name) ?? ''} style={{fontSize:'1.8rem',lineHeight:1,display:'inline-block',flexShrink:0}} />

        {/* Name + bar */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate leading-none mb-1.5
            group-hover:text-[#c8f000] transition-colors">
            {team.name}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg,${tier.color},${tier.color}88)` }} />
            </div>
            <span className="text-xs font-black shrink-0 tabular-nums"
              style={{ color: tier.color }}>{team.elo}</span>
          </div>
        </div>

        {/* Group badge */}
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          <span className="text-xs font-black px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontSize: "0.6rem", letterSpacing: "0.06em" }}>
            GRP {team.group}
          </span>
        </div>

        {/* Chevron */}
        <svg className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "#c8f000" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 18l6-6-6-6" />
        </svg>
      </button>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-white mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}>
          Teams
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          {ALL_TEAMS.length} nations · Click any team to view stats, lineup &amp; AI summary
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Search */}
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "rgba(255,255,255,0.25)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search teams…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm text-white placeholder-white/25 outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
        </div>

        {/* View toggle */}
        <div className="flex rounded-xl overflow-hidden shrink-0"
          style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
          {[
            { id: "elo",   label: "By ELO Rank" },
            { id: "group", label: "By Group" },
          ].map(opt => (
            <button key={opt.id}
              onClick={() => setView(opt.id)}
              className="px-4 py-2 text-xs font-bold transition-all"
              style={{
                background: view === opt.id ? "rgba(200,240,0,0.15)" : "transparent",
                color: view === opt.id ? "#c8f000" : "rgba(255,255,255,0.4)",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === "elo" ? (
        <div className="flex flex-col gap-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
              No teams found for "{search}"
            </p>
          ) : (
            filtered.map(t => <TeamCard key={t.name} team={t} />)
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map(g => {
            const teams = byGroup[g];
            if (!teams?.length) return null;
            return (
              <div key={g}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)" }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.85rem", color: "#1a0533" }}>{g}</span>
                  </div>
                  <span className="text-sm font-bold text-white">Group {g}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {teams.map(t => <TeamCard key={t.name} team={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
