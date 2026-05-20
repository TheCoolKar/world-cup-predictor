import { useState } from "react";
import fixtures from "../data/wc2026_fixtures.json";
import { getPicks, getBracket, saveBracket } from "../utils/storage";

const GROUP_MATCHES = fixtures.filter((m) => m.group);
const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const ROUNDS = ["R32", "R16", "QF", "SF", "F"];
const ROUND_LABELS = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF:  "Quarter-Finals",
  SF:  "Semi-Finals",
  F:   "Final",
};
const ROUND_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, F: 1 };

// ── Standings (same logic as Predict.jsx) ────────────────────────────────────

function calcStandings(matches, picks) {
  const table = {};
  for (const m of matches) {
    if (!table[m.home]) table[m.home] = { team: m.home, pts: 0, wins: 0, draws: 0, losses: 0, played: 0 };
    if (!table[m.away]) table[m.away] = { team: m.away, pts: 0, wins: 0, draws: 0, losses: 0, played: 0 };
    const pick = picks[m.id];
    if (!pick) continue;
    const h = table[m.home];
    const a = table[m.away];
    h.played++; a.played++;
    if (pick === "home")      { h.wins++; h.pts += 3; a.losses++; }
    else if (pick === "away") { a.wins++; a.pts += 3; h.losses++; }
    else                      { h.draws++; h.pts++; a.draws++; a.pts++; }
  }
  return Object.values(table).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}

// ── Derive qualified teams from picks ────────────────────────────────────────

function getQualifiedTeams(picks) {
  const byGroup = {};
  for (const g of GROUPS) {
    const matches = GROUP_MATCHES.filter((m) => m.group === g);
    byGroup[g] = calcStandings(matches, picks);
  }

  const winners   = {};
  const runnersUp = {};
  const thirdPlacePool = [];

  for (const g of GROUPS) {
    const s = byGroup[g];
    winners[g]   = s[0]?.team ?? null;
    runnersUp[g] = s[1]?.team ?? null;
    if (s[2]) thirdPlacePool.push({ ...s[2], group: g });
  }

  const best8 = thirdPlacePool
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins)
    .slice(0, 8)
    .map((t) => t.team);

  while (best8.length < 8) best8.push(null);
  return { winners, runnersUp, third: best8 };
}

// ── Build the 16 R32 matchups ─────────────────────────────────────────────────

function buildR32(winners, runnersUp, third) {
  const w = (g) => winners[g]   ?? null;
  const r = (g) => runnersUp[g] ?? null;
  const t = (i) => third[i]     ?? null;

  return [
    { home: w("A"), away: r("B") },  // 0
    { home: w("C"), away: r("D") },  // 1
    { home: w("E"), away: r("F") },  // 2
    { home: w("G"), away: r("H") },  // 3
    { home: w("I"), away: r("J") },  // 4
    { home: w("K"), away: r("L") },  // 5
    { home: w("B"), away: r("A") },  // 6
    { home: w("D"), away: r("C") },  // 7
    { home: w("F"), away: r("E") },  // 8
    { home: w("H"), away: r("G") },  // 9
    { home: w("J"), away: r("I") },  // 10
    { home: w("L"), away: r("K") },  // 11
    { home: t(0),   away: t(1)   },  // 12
    { home: t(2),   away: t(3)   },  // 13
    { home: t(4),   away: t(5)   },  // 14
    { home: t(6),   away: t(7)   },  // 15
  ];
}

// ── Winner state helpers ──────────────────────────────────────────────────────

function emptyWinners() {
  return {
    R32: Array(16).fill(null),
    R16: Array(8).fill(null),
    QF:  Array(4).fill(null),
    SF:  Array(2).fill(null),
    F:   Array(1).fill(null),
  };
}

function applyPick(prev, round, matchIdx, team) {
  const w = {};
  for (const k of ROUNDS) w[k] = [...prev[k]];

  const oldWinner = w[round][matchIdx];
  // Toggle off if same team clicked again
  w[round][matchIdx] = team === oldWinner ? null : team;

  // Cascade: null out old winner from all later rounds
  if (oldWinner) {
    let ri = ROUNDS.indexOf(round) + 1;
    let mi = Math.floor(matchIdx / 2);
    while (ri < ROUNDS.length) {
      const r = ROUNDS[ri];
      if (w[r][mi] === oldWinner) {
        w[r][mi] = null;
        mi = Math.floor(mi / 2);
        ri++;
      } else {
        break;
      }
    }
  }

  return w;
}

// For a match in any round, derive home/away from previous round winners
function getTeams(round, matchIdx, winners, r32) {
  if (round === "R32") return r32[matchIdx] ?? { home: null, away: null };
  const prev = ROUNDS[ROUNDS.indexOf(round) - 1];
  return {
    home: winners[prev][matchIdx * 2]     ?? null,
    away: winners[prev][matchIdx * 2 + 1] ?? null,
  };
}

// ── Flag emoji ────────────────────────────────────────────────────────────────

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
};

function getFlag(name) {
  if (!name) return "";
  const code = FLAG_CODES[name];
  if (!code) return "🏳️";
  if (code === "gb-sct") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
  if (code === "gb-eng") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  return code.toUpperCase().split("").map((c) =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  ).join("");
}

// ── Bracket match card ────────────────────────────────────────────────────────

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
          cursor: isTbd ? "default" : "pointer",
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
        {isWinner && <span className="text-xs" style={{ color: "#c8f000" }}>✓</span>}
      </button>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        width: 168,
        background: winner ? "rgba(200,240,0,0.06)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isFinal && winner ? "rgba(200,240,0,0.45)" : winner ? "rgba(200,240,0,0.2)" : "rgba(255,255,255,0.09)"}`,
        boxShadow: isFinal && winner ? "0 0 24px rgba(200,240,0,0.15)" : "none",
      }}
    >
      <TeamBtn team={home} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
      <TeamBtn team={away} />
    </div>
  );
}

// ── Main Bracket page ─────────────────────────────────────────────────────────

export default function Bracket() {
  const picks = getPicks();
  const { winners: gW, runnersUp, third } = getQualifiedTeams(picks);
  const r32 = buildR32(gW, runnersUp, third);

  const [bw, setBw] = useState(() => getBracket() ?? emptyWinners());

  function handlePick(round, matchIdx, team) {
    const next = applyPick(bw, round, matchIdx, team);
    setBw(next);
    saveBracket(next);
  }

  const champion = bw.F[0];

  // Each R32 slot = 80px; total bracket height = 16 × 80 = 1280px
  const SLOT_H = 80;
  const BRACKET_H = 16 * SLOT_H;

  // Count how many picks are done
  const totalPicks = ROUNDS.reduce((sum, r) => sum + bw[r].filter(Boolean).length, 0);
  const maxPicks   = 16 + 8 + 4 + 2 + 1; // 31

  return (
    <div className="px-4 py-10" style={{ maxWidth: "100vw" }}>

      {/* Header */}
      <div className="mb-6" style={{ maxWidth: 800 }}>
        <h2
          className="text-white mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}
        >
          Knockout Bracket
        </h2>
        <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Seeded from your group stage predictions. Click a team to advance them through each round.
        </p>

        <div className="flex items-center gap-3">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", width: 180 }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((totalPicks / maxPicks) * 100)}%`,
                background: champion ? "linear-gradient(90deg, #c8f000, #22c55e)" : "linear-gradient(90deg, #c8f000, #84cc16)",
              }}
            />
          </div>
          <span className="text-xs font-semibold" style={{ color: champion ? "#22c55e" : "#c8f000" }}>
            {totalPicks} / {maxPicks} picks
          </span>
        </div>
      </div>

      {/* ── Bracket ── */}
      <div className="overflow-x-auto pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex gap-3" style={{ minWidth: "max-content", height: BRACKET_H }}>

          {ROUNDS.map((round, ri) => {
            const count    = ROUND_COUNTS[round];
            const slotFlex = Math.pow(2, ri);

            return (
              <div key={round} style={{ width: 172, display: "flex", flexDirection: "column" }}>
                {/* Round label */}
                <div className="mb-2 text-center shrink-0">
                  <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#c8f000", opacity: 0.8 }}
                  >
                    {ROUND_LABELS[round]}
                  </span>
                </div>

                {/* Matches column */}
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  {Array.from({ length: count }, (_, i) => {
                    const { home, away } = getTeams(round, i, bw, r32);
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
                          onPick={(team) => handlePick(round, i, team)}
                          isFinal={round === "F"}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Champion column */}
          <div
            style={{ width: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          >
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: champion
                  ? "linear-gradient(135deg, rgba(200,240,0,0.12), rgba(34,197,94,0.12))"
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
      <div className="flex flex-wrap gap-5 mt-3" style={{ maxWidth: 800 }}>
        {[
          { style: { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }, label: "Selected winner" },
          { style: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }, label: "TBD — waiting on previous round" },
        ].map(({ style, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-8 h-5 rounded" style={style} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
