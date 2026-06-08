import { useState } from "react";
import fixtures from "../data/wc2026_fixtures.json";
import PredictCard from "../components/PredictCard";
import { getPicks, clearPicks } from "../utils/storage";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const GROUP_MATCHES = fixtures.filter((m) => m.group);
const TOTAL = GROUP_MATCHES.length;

function calcStandings(matches, picks) {
  const table = {};
  for (const m of matches) {
    if (!table[m.home]) table[m.home] = { team: m.home, played: 0, wins: 0, draws: 0, losses: 0, pts: 0 };
    if (!table[m.away]) table[m.away] = { team: m.away, played: 0, wins: 0, draws: 0, losses: 0, pts: 0 };
    const pick = picks[m.id];
    if (!pick) continue;
    const h = table[m.home]; const a = table[m.away];
    h.played++; a.played++;
    if (pick === "home")      { h.wins++; h.pts += 3; a.losses++; }
    else if (pick === "away") { a.wins++; a.pts += 3; h.losses++; }
    else                      { h.draws++; h.pts++; a.draws++; a.pts++; }
  }
  return Object.values(table).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}

export default function Predict({ submittedGroups, setSubmittedGroups, onNavigate }) {
  const [picks, setPicks]         = useState(getPicks);
  const [openGroup, setOpenGroup] = useState("A");
  const [justReset, setJustReset] = useState(false);

  function handlePick(matchId, value) {
    setPicks((prev) => ({ ...prev, [matchId]: value }));
    const match = GROUP_MATCHES.find((m) => m.id === matchId);
    if (match) {
      setSubmittedGroups((prev) => { const next = { ...prev }; delete next[match.group]; return next; });
    }
  }

  function handleReset() {
    clearPicks(); setPicks({}); setSubmittedGroups({});
    setJustReset(true); setTimeout(() => setJustReset(false), 2000);
  }

  function handleSubmitAll() {
    const all = {}; for (const g of GROUPS) all[g] = true; setSubmittedGroups(all);
  }

  function handleSubmitGroup(group) {
    setSubmittedGroups((prev) => ({ ...prev, [group]: true }));
  }

  function toggle(group) {
    setOpenGroup((prev) => (prev === group ? null : group));
  }

  const allGroupsDone      = GROUPS.every((g) => {
    const m = GROUP_MATCHES.filter((x) => x.group === g);
    return m.length > 0 && m.every((x) => picks[x.id] != null);
  });
  const allGroupsSubmitted = GROUPS.every((g) => submittedGroups[g]);

  const pickedCount = Object.values(picks).filter((v) => v != null).length;
  const pct         = Math.round((pickedCount / TOTAL) * 100);
  const homeWins    = Object.values(picks).filter((v) => v === "home").length;
  const draws       = Object.values(picks).filter((v) => v === "draw").length;
  const awayWins    = Object.values(picks).filter((v) => v === "away").length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">

      {/* Title */}
      <div className="mb-6">
        <h2 className="text-white mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}>
          Make Your Picks
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Predict every group stage match. Picks save automatically. Submit each group to see its standings table.
        </p>
      </div>

      {/* Progress + stats card */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-white">{pickedCount} / {TOTAL} matches predicted</span>
          <span className="text-sm font-bold" style={{ color: "#c8f000" }}>{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct === 100 ? "linear-gradient(90deg, #c8f000, #22c55e)" : "linear-gradient(90deg, #c8f000, #84cc16)",
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Home Wins", value: homeWins, color: "#c8f000" },
            { label: "Draws",     value: draws,    color: "#f59e0b" },
            { label: "Away Wins", value: awayWins, color: "#ef4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", lineHeight: 1, color }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</div>
            </div>
          ))}
        </div>

        {pickedCount > 0 && (
          <button
            onClick={handleReset}
            className="mt-4 w-full py-2 rounded-xl text-xs font-semibold transition-all duration-150"
            style={{
              background: justReset ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
              color: justReset ? "#ef4444" : "rgba(255,255,255,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {justReset ? "✓ All picks cleared" : "Reset all picks"}
          </button>
        )}
      </div>

      {/* Group accordions */}
      <div className="flex flex-col gap-2">
        {GROUPS.map((group) => {
          const matches     = GROUP_MATCHES.filter((m) => m.group === group);
          if (!matches.length) return null;
          const teams       = [...new Set(matches.flatMap((m) => [m.home, m.away]))];
          const groupPicked = matches.filter((m) => picks[m.id] != null).length;
          const groupDone   = groupPicked === matches.length;
          const isOpen      = openGroup === group;
          const isSubmitted = !!submittedGroups[group];
          const standings   = isSubmitted ? calcStandings(matches, picks) : null;

          return (
            <div
              key={group}
              className="rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                border: `1px solid ${isSubmitted ? "rgba(34,197,94,0.3)" : isOpen ? "rgba(200,240,0,0.25)" : groupDone ? "rgba(200,240,0,0.12)" : "rgba(255,255,255,0.07)"}`,
                background: isSubmitted ? "rgba(34,197,94,0.04)" : isOpen ? "rgba(200,240,0,0.04)" : "rgba(255,255,255,0.03)",
              }}
            >
              {/* Header */}
              <button
                onClick={() => toggle(group)}
                className="w-full flex items-center justify-between px-5 py-4 transition-colors duration-150 hover:bg-white/5"
                style={{ background: "transparent" }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200"
                    style={{
                      background: isSubmitted || groupDone
                        ? "linear-gradient(135deg, #22c55e, #16a34a)"
                        : isOpen
                        ? "linear-gradient(135deg, #c8f000, #84cc16)"
                        : "rgba(255,255,255,0.07)",
                    }}
                  >
                    {isSubmitted || groupDone ? (
                      <span className="text-white font-black text-sm">✓</span>
                    ) : (
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: isOpen ? "#1a0533" : "rgba(255,255,255,0.7)" }}>
                        {group}
                      </span>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white leading-none">Group {group}</p>
                      {isSubmitted && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                          Submitted
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>{teams.join(" · ")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-semibold hidden sm:block" style={{ color: groupDone ? "#22c55e" : "rgba(255,255,255,0.25)" }}>
                    {groupPicked}/{matches.length}
                  </span>
                  <svg
                    className="w-4 h-4 transition-transform duration-200"
                    style={{ color: isOpen ? "#c8f000" : "rgba(255,255,255,0.3)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Standings table — visible whenever submitted */}
              {isSubmitted && standings && (
                <div className="mx-4 mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                        {["#", "Team", "P", "W", "D", "L", "Pts"].map((h) => (
                          <th key={h} className={`py-2 font-semibold ${h === "#" || h === "Team" ? "text-left px-3" : "text-center px-2"}`}
                            style={{ color: h === "Pts" ? "#c8f000" : "rgba(255,255,255,0.4)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => {
                        const qualifies = i < 2;
                        return (
                          <tr key={row.team} style={{
                            background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                            borderLeft: qualifies ? "3px solid #22c55e" : "3px solid transparent",
                          }}>
                            <td className="px-3 py-2.5 font-bold" style={{ color: qualifies ? "#22c55e" : "rgba(255,255,255,0.3)" }}>{i + 1}</td>
                            <td className="px-3 py-2.5 font-semibold text-white">{row.team}</td>
                            <td className="px-2 py-2.5 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>{row.played}</td>
                            <td className="px-2 py-2.5 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>{row.wins}</td>
                            <td className="px-2 py-2.5 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>{row.draws}</td>
                            <td className="px-2 py-2.5 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>{row.losses}</td>
                            <td className="px-2 py-2.5 text-center font-black"
                              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1rem", color: qualifies ? "#c8f000" : "rgba(255,255,255,0.55)" }}>
                              {row.pts}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 flex items-center gap-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>Advances to Round of 32</span>
                  </div>
                </div>
              )}

              {/* Accordion body */}
              {isOpen && (
                <div className="px-4 pb-5 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
                    {matches.map((match) => (
                      <PredictCard key={match.id} match={match} pick={picks[match.id]} onPick={handlePick} />
                    ))}
                  </div>
                  <div className="mt-4">
                    {groupDone ? (
                      <button
                        onClick={() => handleSubmitGroup(group)}
                        className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98]"
                        style={{
                          background: isSubmitted ? "rgba(34,197,94,0.15)" : "linear-gradient(135deg, #c8f000, #84cc16)",
                          color: isSubmitted ? "#22c55e" : "#0a0014",
                          border: isSubmitted ? "1px solid rgba(34,197,94,0.3)" : "none",
                        }}
                      >
                        {isSubmitted ? "✓ Submitted — Resubmit Group " + group : "Submit Group " + group}
                      </button>
                    ) : (
                      <div className="w-full py-3 rounded-xl text-sm font-semibold text-center"
                        style={{ color: "rgba(255,255,255,0.2)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                        {matches.length - groupPicked} match{matches.length - groupPicked !== 1 ? "es" : ""} remaining to submit
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      {pickedCount === TOTAL && (
        <div className="mt-6 rounded-2xl p-6"
          style={{ background: "linear-gradient(135deg, rgba(200,240,0,0.08), rgba(34,197,94,0.08))", border: "1px solid rgba(200,240,0,0.2)" }}>
          <p className="text-white font-bold mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", letterSpacing: "0.05em" }}>
            All {TOTAL} matches predicted
          </p>
          <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.7)" }}>
            {homeWins} home wins · {draws} draws · {awayWins} away wins
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {!allGroupsSubmitted && (
              <button
                onClick={handleSubmitAll}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #c8f000, #84cc16)", color: "#0a0014" }}
              >
                Submit All Groups
              </button>
            )}
            <button
              onClick={() => onNavigate?.("bracket")}
              disabled={!allGroupsSubmitted}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: allGroupsSubmitted ? "linear-gradient(135deg, #c8f000, #84cc16)" : "rgba(255,255,255,0.05)",
                color: allGroupsSubmitted ? "#0a0014" : "rgba(255,255,255,0.25)",
                border: allGroupsSubmitted ? "none" : "1px solid rgba(255,255,255,0.1)",
                cursor: allGroupsSubmitted ? "pointer" : "default",
              }}
            >
              {allGroupsSubmitted ? "Go to Knockout Bracket →" : "Submit all groups to unlock bracket"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
