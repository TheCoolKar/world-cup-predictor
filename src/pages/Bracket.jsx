import { useMemo } from "react";
import { simulateTournament } from "../utils/TournamentSimulator";

// ── Flag helper (mirrors MatchCard) ──────────────────────────────────────────
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

function flagEmoji(country) {
  const code = FLAG_CODES[country];
  if (!code) return "🏳️";
  if (code === "gb-sct") return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
  if (code === "gb-eng") return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  return code.toUpperCase().split("").map(c =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  ).join("");
}

// ── Group Standings Table ─────────────────────────────────────────────────────

function GroupTable({ group, rows, thirds }) {
  const thirdTeams = new Set(thirds.map(t => t.team));

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #c8f000, #84cc16)" }}
          >
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "0.75rem", color: "#1a0533" }}>
              {group}
            </span>
          </div>
          <span className="text-xs font-bold text-white">Group {group}</span>
        </div>
        <div className="flex gap-3 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span className="w-4 text-center">P</span>
          <span className="w-4 text-center">W</span>
          <span className="w-4 text-center">D</span>
          <span className="w-4 text-center">L</span>
          <span className="w-6 text-center">GD</span>
          <span className="w-6 text-center font-bold">Pts</span>
        </div>
      </div>

      {/* Rows */}
      {rows.map((t, i) => {
        const qualifies  = i < 2;
        const thirdBest  = i === 2 && thirdTeams.has(t.team);
        const eliminated = !qualifies && !thirdBest;

        return (
          <div
            key={t.team}
            className="flex items-center justify-between px-3 py-2"
            style={{
              borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              background: qualifies
                ? "rgba(200,240,0,0.04)"
                : thirdBest
                  ? "rgba(245,158,11,0.04)"
                  : "transparent",
            }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs w-3 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                {i + 1}
              </span>
              <span className="text-sm leading-none shrink-0">{flagEmoji(t.team)}</span>
              <span
                className="text-xs font-semibold truncate"
                style={{
                  color: qualifies ? "#c8f000"
                    : thirdBest ? "#f59e0b"
                    : "rgba(255,255,255,0.35)",
                }}
              >
                {t.team}
              </span>
              {(qualifies || thirdBest) && (
                <span
                  className="text-xs px-1 py-0 rounded shrink-0"
                  style={{
                    background: qualifies ? "rgba(200,240,0,0.12)" : "rgba(245,158,11,0.12)",
                    color: qualifies ? "#c8f000" : "#f59e0b",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                  }}
                >
                  {qualifies ? "Q" : "3rd"}
                </span>
              )}
            </div>
            <div className="flex gap-3 text-xs shrink-0" style={{ color: eliminated ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)" }}>
              <span className="w-4 text-center">{t.played}</span>
              <span className="w-4 text-center">{t.w}</span>
              <span className="w-4 text-center">{t.d}</span>
              <span className="w-4 text-center">{t.l}</span>
              <span className="w-6 text-center">{t.gd >= 0 ? "+" : ""}{t.gd}</span>
              <span
                className="w-6 text-center font-black"
                style={{ color: qualifies ? "#c8f000" : thirdBest ? "#f59e0b" : "rgba(255,255,255,0.2)" }}
              >
                {t.pts}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Knockout Match Card ───────────────────────────────────────────────────────

function KOMatch({ result, label, isChampion = false, isThirdPlace = false }) {
  if (!result) return (
    <div
      className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 180 }}
    >
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>TBD</span>
    </div>
  );

  const { home, away, winner, homeWinProb, score } = result;
  const homePct = (homeWinProb * 100).toFixed(0);
  const awayPct = (100 - homeWinProb * 100).toFixed(0);

  const accentWinner = isChampion ? "#fbbf24" : isThirdPlace ? "#94a3b8" : "#c8f000";

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: isChampion
          ? "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(251,191,36,0.04))"
          : "rgba(255,255,255,0.04)",
        border: isChampion
          ? "1px solid rgba(251,191,36,0.3)"
          : "1px solid rgba(255,255,255,0.07)",
        minWidth: 176,
      }}
    >
      {label && (
        <div
          className="px-3 py-1 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.03)" }}
        >
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: isChampion ? "#fbbf24" : isThirdPlace ? "#94a3b8" : "#c8f000", fontSize: "0.6rem" }}
          >
            {label}
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.18)", fontSize: "0.6rem" }}>
            {score.home}–{score.away}
          </span>
        </div>
      )}

      {/* Home team */}
      <TeamRow
        team={home}
        pct={homePct}
        isWinner={winner === home}
        accent={accentWinner}
      />
      {/* Separator */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
      {/* Away team */}
      <TeamRow
        team={away}
        pct={awayPct}
        isWinner={winner === away}
        accent={accentWinner}
      />
    </div>
  );
}

function TeamRow({ team, pct, isWinner, accent }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ background: isWinner ? `${accent}0d` : "transparent" }}
    >
      <span className="text-base leading-none shrink-0">{flagEmoji(team)}</span>
      <span
        className="text-xs font-semibold flex-1 truncate"
        style={{ color: isWinner ? accent : "rgba(255,255,255,0.4)" }}
      >
        {team}
      </span>
      <span
        className="text-xs font-bold shrink-0"
        style={{ color: isWinner ? accent : "rgba(255,255,255,0.2)" }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ── Connector line between rounds ─────────────────────────────────────────────

function Connector() {
  return (
    <div className="flex items-center shrink-0 self-stretch">
      <div className="w-4 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
    </div>
  );
}

// ── Round column ──────────────────────────────────────────────────────────────

function RoundColumn({ title, matches, labelFn, isChampion = false, isThirdPlace = false }) {
  return (
    <div className="flex flex-col gap-2 shrink-0">
      <p
        className="text-xs font-bold uppercase tracking-widest text-center mb-1"
        style={{ color: isChampion ? "#fbbf24" : "#c8f000", fontSize: "0.6rem" }}
      >
        {title}
      </p>
      <div className="flex flex-col justify-around flex-1 gap-3">
        {matches.map((result, i) => (
          <KOMatch
            key={i}
            result={result}
            label={labelFn ? labelFn(i) : null}
            isChampion={isChampion}
            isThirdPlace={isThirdPlace}
          />
        ))}
      </div>
    </div>
  );
}

// ── Champion trophy card ──────────────────────────────────────────────────────

function ChampionCard({ team }) {
  return (
    <div className="flex flex-col items-center gap-3 shrink-0">
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#fbbf24", fontSize: "0.6rem" }}>
        Champion
      </p>
      <div
        className="flex flex-col items-center gap-2 rounded-2xl px-5 py-4"
        style={{
          background: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(251,191,36,0.06))",
          border: "1px solid rgba(251,191,36,0.4)",
          boxShadow: "0 0 32px rgba(251,191,36,0.15)",
        }}
      >
        <span style={{ fontSize: "2.5rem", lineHeight: 1 }}>{flagEmoji(team)}</span>
        <span
          className="text-white font-black text-center"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", letterSpacing: "0.06em" }}
        >
          {team}
        </span>
        <span style={{ fontSize: "1.5rem" }}>🏆</span>
      </div>
    </div>
  );
}

// ── Main Bracket Page ─────────────────────────────────────────────────────────

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export default function Bracket() {
  const sim = useMemo(() => simulateTournament(), []);
  const { standings, thirds, r32Results, r16Results, qfResults, sfResults, finalResult, thirdPlace } = sim;

  const champion = finalResult.winner;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <h2
          className="text-white mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}
        >
          Tournament Bracket
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Predicted results for all 32 knockout matches · based on ELO + form data
        </p>
      </div>

      {/* ── Group Standings ── */}
      <section className="mb-10">
        <h3
          className="text-white mb-4"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: "0.06em" }}
        >
          Predicted Group Standings
        </h3>

        {/* Legend */}
        <div className="flex gap-4 mb-4">
          {[
            { color: "#c8f000", bg: "rgba(200,240,0,0.1)",  label: "Qualify (Top 2)" },
            { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "Best 3rd Place (8 of 12 advance)" },
          ].map(({ color, bg, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ background: bg, border: `1px solid ${color}` }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {GROUPS.map(g => (
            <GroupTable key={g} group={g} rows={standings[g]} thirds={thirds} />
          ))}
        </div>
      </section>

      {/* ── Knockout Bracket ── */}
      <section>
        <h3
          className="text-white mb-4"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: "0.06em" }}
        >
          Knockout Bracket
        </h3>

        {/* Scrollable bracket */}
        <div className="overflow-x-auto pb-6">
          <div className="flex items-start gap-0" style={{ minWidth: 1200 }}>

            {/* Round of 32 (col 1) */}
            <RoundColumn
              title="Round of 32"
              matches={r32Results.slice(0, 8)}
              labelFn={i => `R32 · Match ${i + 1}`}
            />
            <Connector />

            {/* R16 — left half (col 2) */}
            <RoundColumn
              title="Round of 16"
              matches={r16Results.slice(0, 4)}
              labelFn={i => `R16 · Match ${i + 1}`}
            />
            <Connector />

            {/* QF — left half (col 3) */}
            <RoundColumn
              title="Quarterfinal"
              matches={qfResults.slice(0, 2)}
              labelFn={i => `QF · ${i + 1}`}
            />
            <Connector />

            {/* SF1 + Final + SF2 (center) */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <p
                className="text-xs font-bold uppercase tracking-widest text-center mb-1"
                style={{ color: "#c8f000", fontSize: "0.6rem" }}
              >
                Semifinal
              </p>
              <KOMatch result={sfResults[0]} label="SF 1" />
              <div className="my-2">
                <ChampionCard team={champion} />
              </div>
              <KOMatch result={sfResults[1]} label="SF 2" />
            </div>

            <Connector />

            {/* QF — right half (col 4) */}
            <RoundColumn
              title="Quarterfinal"
              matches={qfResults.slice(2, 4)}
              labelFn={i => `QF · ${i + 3}`}
            />
            <Connector />

            {/* R16 — right half (col 5) */}
            <RoundColumn
              title="Round of 16"
              matches={r16Results.slice(4, 8)}
              labelFn={i => `R16 · Match ${i + 5}`}
            />
            <Connector />

            {/* R32 — right half (col 6) */}
            <RoundColumn
              title="Round of 32"
              matches={r32Results.slice(8, 16)}
              labelFn={i => `R32 · Match ${i + 9}`}
            />

          </div>
        </div>

        {/* 3rd place */}
        <div className="mt-6 flex items-center gap-4">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-widest mb-2"
              style={{ color: "#94a3b8", fontSize: "0.6rem" }}
            >
              3rd Place Play-Off
            </p>
            <KOMatch result={thirdPlace} label="3rd Place" isThirdPlace />
          </div>
        </div>
      </section>

      {/* ── Best 3rd-Place Teams Section ── */}
      <section className="mt-10">
        <h3
          className="text-white mb-4"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: "0.06em" }}
        >
          Best 3rd-Place Teams
        </h3>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>
          The 8 best third-place finishers advance to the Round of 32. Ranked by points → goal difference → goals scored.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {thirds.map((t, i) => (
            <div
              key={t.team}
              className="rounded-xl px-3 py-2.5 flex flex-col items-center gap-1.5"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.15)",
              }}
            >
              <span className="text-xs font-black" style={{ color: "#f59e0b" }}>#{i + 1}</span>
              <span className="text-xl leading-none">{flagEmoji(t.team)}</span>
              <span className="text-xs font-semibold text-center leading-tight" style={{ color: "rgba(255,255,255,0.7)" }}>
                {t.team}
              </span>
              <div className="flex gap-2 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                <span>{t.pts}pts</span>
                <span>{t.gd >= 0 ? "+" : ""}{t.gd}</span>
              </div>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.6rem" }}>
                Grp {t.group}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
