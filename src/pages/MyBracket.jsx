/**
 * MyBracket.jsx — interactive bracket where the user picks their own winners
 *
 * Teams in the Round of 32 are seeded automatically from the AI's predicted
 * group standings (TournamentSimulator). From R32 onwards, the user clicks a
 * team to advance them through each round. Picks are cascaded automatically
 * (changing a winner nulls out that team from all later rounds) and saved to
 * localStorage so the bracket persists across page refreshes.
 */

import { useState, useMemo } from "react";
import { simulateTournament }  from "../utils/TournamentSimulator";
import { getBracket, saveBracket, clearBracket } from "../utils/storage";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROUNDS = ["R32", "R16", "QF", "SF", "F"];
const ROUND_LABELS = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF:  "Quarter-Finals",
  SF:  "Semi-Finals",
  F:   "Final",
};
const ROUND_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 };

// ── Flag helper ───────────────────────────────────────────────────────────────

const FLAG_CODES = {
  "Mexico": "mx", "South Africa": "za", "South Korea": "kr", "Czechia": "cz",
  "Canada": "ca", "Qatar": "qa", "Switzerland": "ch", "Bosnia and Herzegovina": "ba",
  "Brazil": "br", "Morocco": "ma", "Haiti": "ht", "Scotland": "gb-sct",
  "USA": "us", "Paraguay": "py", "Australia": "au", "Türkiye": "tr",
  "Germany": "de", "Curaçao": "cw", "Ivory Coast": "ci", "Ecuador": "ec",
  "Netherlands": "nl", "Japan": "jp", "Sweden": "se", "Tunisia": "tn",
  "Belgium": "be", "Egypt": "eg", "Iran": "ir", "New Zealand": "nz",
  "Spain": "es", "Cape Verde": "cv", "Saudi Arabia": "sa", "Uruguay": "uy",
  "France": "fr", "Senegal": "sn", "Norway": "no", "Iraq": "iq",
  "Argentina": "ar", "Algeria": "dz", "Austria": "at", "Jordan": "jo",
  "Portugal": "pt", "DR Congo": "cd", "Uzbekistan": "uz", "Colombia": "co",
  "England": "gb-eng", "Croatia": "hr", "Ghana": "gh", "Panama": "pa",
  "Nigeria": "ng",
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

// ── State helpers ─────────────────────────────────────────────────────────────

/** Build the initial empty winners state shape. */
function emptyWinners() {
  return {
    R32: Array(16).fill(null),
    R16: Array(8).fill(null),
    QF:  Array(4).fill(null),
    SF:  Array(2).fill(null),
    F:   Array(1).fill(null),
  };
}

/**
 * Apply a pick — toggle if same team clicked again, then cascade-clear
 * all later rounds that held the old winner.
 */
function applyPick(prev, round, matchIdx, team) {
  const next = {};
  for (const k of ROUNDS) next[k] = [...prev[k]];

  const oldWinner = next[round][matchIdx];
  next[round][matchIdx] = team === oldWinner ? null : team;

  // Cascade: remove the old winner from all subsequent rounds
  if (oldWinner) {
    let ri = ROUNDS.indexOf(round) + 1;
    let mi = Math.floor(matchIdx / 2);
    while (ri < ROUNDS.length) {
      const r = ROUNDS[ri];
      if (next[r][mi] === oldWinner) {
        next[r][mi] = null;
        mi = Math.floor(mi / 2);
        ri++;
      } else {
        break;
      }
    }
  }

  return next;
}

/**
 * For a match slot in any round, look up the two teams.
 * R32 slots come directly from the simulator's r32Slots array.
 * Later rounds look up the winners of the two preceding matches.
 */
function getTeams(round, matchIdx, winners, r32Slots) {
  if (round === "R32") {
    const slot = r32Slots[matchIdx] ?? {};
    return { home: slot.home ?? null, away: slot.away ?? null };
  }
  const prev = ROUNDS[ROUNDS.indexOf(round) - 1];
  return {
    home: winners[prev]?.[matchIdx * 2]     ?? null,
    away: winners[prev]?.[matchIdx * 2 + 1] ?? null,
  };
}

// ── Bracket match card (interactive) ─────────────────────────────────────────

function BracketMatch({ home, away, winner, onPick, isFinal }) {
  function TeamBtn({ team }) {
    const isWinner = winner === team;
    const isLoser  = winner && winner !== team;
    const isTbd    = !team;

    return (
      <button
        onClick={() => team && onPick(team)}
        disabled={isTbd}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-all duration-100 active:scale-95"
        style={{
          background: isWinner ? "rgba(200,240,0,0.15)" : "transparent",
          cursor:  isTbd ? "default" : "pointer",
          opacity: isLoser ? 0.3 : 1,
        }}
      >
        <span className="text-sm leading-none shrink-0" style={{ minWidth: 20 }}>
          {isTbd ? "" : getFlag(team)}
        </span>
        <span
          className="text-xs font-semibold truncate flex-1 leading-tight"
          style={{ color: isWinner ? "#c8f000" : isTbd ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.8)" }}
        >
          {team ?? "TBD"}
        </span>
        {isWinner && <span className="text-xs shrink-0" style={{ color: "#c8f000" }}>✓</span>}
      </button>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        width: 168,
        background: winner ? "rgba(200,240,0,0.06)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${
          isFinal && winner ? "rgba(200,240,0,0.45)"
          : winner          ? "rgba(200,240,0,0.2)"
          :                   "rgba(255,255,255,0.09)"
        }`,
        boxShadow: isFinal && winner ? "0 0 24px rgba(200,240,0,0.15)" : "none",
      }}
    >
      <TeamBtn team={home} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
      <TeamBtn team={away} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyBracket() {
  // Run the AI simulation once to get the seeded R32 matchups
  const sim      = useMemo(() => simulateTournament(), []);
  const r32Slots = sim.r32Slots; // [{ home, away }, …] × 16

  // Initialise bracket state: load saved picks, fall back to empty
  const [bw, setBw] = useState(() => getBracket() ?? emptyWinners());

  function handlePick(round, matchIdx, team) {
    const next = applyPick(bw, round, matchIdx, team);
    setBw(next);
    saveBracket(next);
  }

  function handleReset() {
    clearBracket();
    setBw(emptyWinners());
  }

  const champion  = bw.F[0];
  const totalPicks = ROUNDS.reduce((sum, r) => sum + bw[r].filter(Boolean).length, 0);
  const maxPicks   = 16 + 8 + 4 + 2 + 1; // 31

  // Layout constants
  const SLOT_H    = 80;
  const BRACKET_H = 16 * SLOT_H;

  return (
    <div className="px-4 py-10" style={{ maxWidth: "100vw" }}>

      {/* Header */}
      <div className="mb-6" style={{ maxWidth: 820 }}>
        <h2 className="text-white mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}>
          My Bracket
        </h2>
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
          R32 teams are seeded from the AI's predicted group standings.
          Click any team to advance them — picks cascade automatically through every round.
        </p>

        {/* Progress bar + controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", width: 160 }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((totalPicks / maxPicks) * 100)}%`,
                  background: champion
                    ? "linear-gradient(90deg,#c8f000,#22c55e)"
                    : "linear-gradient(90deg,#c8f000,#84cc16)",
                }}
              />
            </div>
            <span className="text-xs font-semibold" style={{ color: champion ? "#22c55e" : "#c8f000" }}>
              {totalPicks} / {maxPicks} picks
            </span>
          </div>

          <button
            onClick={handleReset}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.45)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            ↺ Reset bracket
          </button>
        </div>
      </div>

      {/* Bracket */}
      <div className="overflow-x-auto pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex gap-3" style={{ minWidth: "max-content", height: BRACKET_H }}>

          {ROUNDS.map((round, ri) => {
            const count    = ROUND_COUNTS[round];
            const slotFlex = Math.pow(2, ri);

            return (
              <div key={round} style={{ width: 172, display: "flex", flexDirection: "column" }}>
                <div className="mb-2 text-center shrink-0">
                  <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#c8f000", opacity: 0.8, fontSize: "0.6rem" }}
                  >
                    {ROUND_LABELS[round]}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  {Array.from({ length: count }, (_, i) => {
                    const { home, away } = getTeams(round, i, bw, r32Slots);
                    const winner = bw[round][i];
                    return (
                      <div
                        key={i}
                        style={{ flex: slotFlex, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <BracketMatch
                          home={home}
                          away={away}
                          winner={winner}
                          onPick={team => handlePick(round, i, team)}
                          isFinal={round === "F"}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Champion reveal */}
          <div style={{ width: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: champion
                  ? "linear-gradient(135deg,rgba(200,240,0,0.12),rgba(34,197,94,0.12))"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${champion ? "rgba(200,240,0,0.35)" : "rgba(255,255,255,0.07)"}`,
                width: 140,
              }}
            >
              {champion ? (
                <>
                  <div className="text-3xl mb-2">🏆</div>
                  <div className="text-2xl mb-1">{getFlag(champion)}</div>
                  <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.2rem", letterSpacing: "0.04em", color: "#c8f000", lineHeight: 1.1 }}>
                    {champion}
                  </p>
                  <p className="text-xs mt-1.5 font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>Your Champion</p>
                </>
              ) : (
                <>
                  <div className="text-3xl mb-2 opacity-30">🏆</div>
                  <p className="text-xs leading-tight" style={{ color: "rgba(255,255,255,0.2)" }}>
                    Complete the bracket to crown a champion
                  </p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 mt-2" style={{ maxWidth: 800 }}>
        {[
          { label: "Click a team to advance them to the next round" },
          { label: "Click the same team again to undo the pick" },
          { label: "Changing a pick auto-clears them from all future rounds" },
        ].map(({ label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(200,240,0,0.5)" }} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
