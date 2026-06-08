import { useEffect } from "react";
import { createPortal } from "react-dom";

// Shorten long tournament names for display
const SHORT_TOURNAMENT = {
  "FIFA World Cup":                         "World Cup",
  "FIFA World Cup qualification":           "WC Qualifier",
  "UEFA Euro":                              "Euro",
  "UEFA Euro qualification":               "Euro Qualifier",
  "UEFA Nations League":                    "Nations League",
  "Copa América":                           "Copa América",
  "African Cup of Nations":                 "AFCON",
  "African Cup of Nations qualification":   "AFCON Qualifier",
  "AFC Asian Cup":                          "Asian Cup",
  "AFC Asian Cup qualification":            "Asian Cup Qualifier",
  "CONCACAF Nations League":               "CONCACAF NL",
  "Gold Cup":                               "Gold Cup",
  "Friendly":                               "Friendly",
};

function shortTournament(name) {
  return SHORT_TOURNAMENT[name] ?? name;
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// Mini stat box
function StatBox({ label, value, accent }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl"
      style={{ background: "rgba(255,255,255,0.05)" }}
    >
      <span
        className="text-xl font-black"
        style={{ fontFamily: "'Bebas Neue', sans-serif", color: accent ?? "#c8f000", letterSpacing: "0.04em" }}
      >
        {value}
      </span>
      <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
        {label}
      </span>
    </div>
  );
}

export default function H2HModal({ h2h, home, away, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const all     = h2h.allTime;
  const recent  = h2h.since2010;
  const last5   = h2h.last5Meetings ?? [];

  return createPortal(
    // Backdrop — rendered at document.body, escaping any parent transform context
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 2, 28, 0.85)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "#1a0533",
          border: "1px solid rgba(200,240,0,0.2)",
          boxShadow: "0 0 60px rgba(200,240,0,0.08), 0 24px 48px rgba(0,0,0,0.6)",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(200,240,0,0.12), rgba(200,240,0,0.04))",
            borderBottom: "1px solid rgba(200,240,0,0.15)",
          }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] mb-1" style={{ color: "#c8f000" }}>
              Head to Head
            </p>
            <h2
              className="text-white leading-tight"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", letterSpacing: "0.06em" }}
            >
              {home} <span style={{ color: "rgba(255,255,255,0.55)" }}>vs</span> {away}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-6">

          {/* All-time summary */}
          <div>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
              All Time · {all.played} meetings
            </p>
            <div className="grid grid-cols-5 gap-2 items-center">
              <div className="col-span-2">
                <StatBox label={home}    value={all.homeTeamWins} accent="#c8f000" />
              </div>
              <div>
                <StatBox label="Draws"   value={all.draws}        accent="rgba(255,255,255,0.45)" />
              </div>
              <div className="col-span-2">
                <StatBox label={away}    value={all.awayTeamWins} accent="#ef4444" />
              </div>
            </div>
            {/* Goals */}
            <div className="flex justify-between mt-2 px-1">
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                {all.homeTeamGoals} goals scored
              </span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                {all.awayTeamGoals} goals scored
              </span>
            </div>
          </div>

          {/* Since 2010 */}
          {recent.played > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
                Since 2010 · {recent.played} meetings
              </p>
              <div className="grid grid-cols-5 gap-2 items-center">
                <div className="col-span-2">
                  <StatBox label={home}  value={recent.homeTeamWins} accent="#c8f000" />
                </div>
                <div>
                  <StatBox label="Draws" value={recent.draws}        accent="rgba(255,255,255,0.45)" />
                </div>
                <div className="col-span-2">
                  <StatBox label={away}  value={recent.awayTeamWins} accent="#ef4444" />
                </div>
              </div>
            </div>
          )}

          {/* Last meetings */}
          {last5.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
                Last {last5.length} Meetings
              </p>
              <div className="flex flex-col gap-2">
                {last5.map((m, i) => {
                  // Determine result from the WC home team's perspective
                  const wcHomeIsMatchHome = m.homeTeam === home;
                  const wcHomeGoals = wcHomeIsMatchHome ? m.homeScore : m.awayScore;
                  const wcAwayGoals = wcHomeIsMatchHome ? m.awayScore : m.homeScore;
                  const result = wcHomeGoals > wcAwayGoals ? "W"
                    : wcHomeGoals < wcAwayGoals ? "L" : "D";
                  const RESULT_COLOR = { W: "#c8f000", D: "#f59e0b", L: "#ef4444" };

                  return (
                    <div
                      key={i}
                      className="rounded-xl px-4 py-3 flex items-center gap-3"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {/* Result badge */}
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                        style={{
                          background: `${RESULT_COLOR[result]}22`,
                          color: RESULT_COLOR[result],
                          border: `1px solid ${RESULT_COLOR[result]}44`,
                        }}
                      >
                        {result}
                      </span>

                      {/* Teams + score */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-bold truncate"
                            style={{ color: m.homeTeam === home ? "#c8f000" : "rgba(255,255,255,0.7)" }}
                          >
                            {m.homeTeam}
                          </span>
                          <span
                            className="text-sm font-black shrink-0 px-2 py-0.5 rounded"
                            style={{
                              background: "rgba(255,255,255,0.08)",
                              color: "white",
                              fontFamily: "'Bebas Neue', sans-serif",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {m.homeScore} – {m.awayScore}
                          </span>
                          <span
                            className="text-sm font-bold truncate"
                            style={{ color: m.awayTeam === away ? "#ef4444" : "rgba(255,255,255,0.7)" }}
                          >
                            {m.awayTeam}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                            {formatDate(m.date)}
                          </span>
                          <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                          <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                            {shortTournament(m.tournament)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {last5.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: "rgba(255,255,255,0.55)" }}>
              No previous meetings found in dataset.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
