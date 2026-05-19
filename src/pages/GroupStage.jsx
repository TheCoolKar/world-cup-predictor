import { useState } from "react";
import fixtures from "../data/wc2026_fixtures.json";
import MatchCard from "../components/MatchCard";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export default function GroupStage() {
  const [openGroup, setOpenGroup] = useState(null);

  function toggle(group) {
    setOpenGroup((prev) => (prev === group ? null : group));
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h2
          className="text-white mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}
        >
          Group Stage
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Click a group to view match predictions · June 11 – June 27, 2026
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {GROUPS.map((group) => {
          const matches = fixtures.filter((m) => m.group === group);
          if (!matches.length) return null;

          const teams = [...new Set(matches.flatMap((m) => [m.home, m.away]))];
          const isOpen = openGroup === group;

          return (
            <div
              key={group}
              className="rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                border: `1px solid ${isOpen ? "rgba(200,240,0,0.25)" : "rgba(255,255,255,0.07)"}`,
                background: isOpen ? "rgba(200,240,0,0.04)" : "rgba(255,255,255,0.03)",
              }}
            >
              <button
                onClick={() => toggle(group)}
                className="w-full flex items-center justify-between px-5 py-4 transition-colors duration-150 hover:bg-white/5"
                style={{ background: "transparent" }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200"
                    style={{
                      background: isOpen
                        ? "linear-gradient(135deg, #c8f000, #84cc16)"
                        : "rgba(255,255,255,0.07)",
                    }}
                  >
                    <span
                      className="font-black"
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: "1.1rem",
                        letterSpacing: "0.05em",
                        color: isOpen ? "#1a0533" : "rgba(255,255,255,0.7)",
                      }}
                    >
                      {group}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white leading-none">Group {group}</p>
                    <p className="text-xs mt-1 leading-tight" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {teams.join(" · ")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs hidden sm:block" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {matches.length} matches
                  </span>
                  <svg
                    className="w-4 h-4 transition-transform duration-200"
                    style={{
                      color: isOpen ? "#c8f000" : "rgba(255,255,255,0.3)",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div
                  className="px-4 pb-5 pt-1"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
                    {matches.map((match) => (
                      <MatchCard key={match.id} match={match} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
