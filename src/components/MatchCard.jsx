import { useState }       from "react";
import { predictMatch, predictScore } from "../utils/Predictions";
import eloRatings        from "../data/elo_ratings.json";
import { useTeamModal }  from "../context/TeamModalContext";
import teamForm          from "../data/team_form.json";
import historicalStats   from "../data/team_historical_stats.json";
import h2hStats          from "../data/h2h_stats.json";
import H2HModal          from "./H2HModal";
import { getFlagClass } from "../utils/flags";

function FlagEmoji({ country }) {
  return <span className={getFlagClass(country) ?? ''} style={{fontSize:'1.8rem',lineHeight:1,display:'inline-block',flexShrink:0}} />;
}

const DOT_COLOR = { W: "#c8f000", D: "#f59e0b", L: "#ef4444" };
const DOT_LABEL = { W: "Win", D: "Draw", L: "Loss" };

// Returns exactly 5 W/D/L chars. Prefers live API form; falls back to
// Kaggle historical recent form so every team always has dots shown.
function getFormString(apiForm, histStats) {
  const api  = apiForm?.recentForm  ?? "";
  const hist = histStats?.recent?.recentForm ?? "";
  const src  = api.length >= 5 ? api : hist;
  return src.slice(0, 5).padEnd(5, "?"); // "?" renders as empty dot
}

function FormDots({ form }) {
  const slots = Array.from({ length: 5 }, (_, i) => {
    const r = form?.[i];
    return r === "W" || r === "D" || r === "L" ? r : null;
  });
  return (
    <div className="flex gap-1 justify-center items-center h-3">
      {slots.map((r, i) => (
        <span
          key={i}
          title={r ? DOT_LABEL[r] : "No data"}
          className="w-2 h-2 rounded-full inline-block"
          style={{ background: r ? DOT_COLOR[r] : "rgba(255,255,255,0.1)" }}
        />
      ))}
    </div>
  );
}

export default function MatchCard({ match }) {
  const { openTeam } = useTeamModal();
  const [showH2H,       setShowH2H]       = useState(false);
  const [h2hHovered,    setH2hHovered]    = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { home, away, date, time, city, matchday } = match;

  const eloHome      = eloRatings[home];
  const eloAway      = eloRatings[away];
  const apiFormHome  = teamForm[home]        ?? null;
  const apiFormAway  = teamForm[away]        ?? null;
  const histHome     = historicalStats[home] ?? null;
  const histAway     = historicalStats[away] ?? null;
  const h2h          = h2hStats[match.id]   ?? null;

  // Form strings — exactly 5 chars, API preferred, Kaggle as fallback
  const formStrHome = getFormString(apiFormHome, histHome);
  const formStrAway = getFormString(apiFormAway, histAway);

  const prediction = eloHome && eloAway
    ? predictMatch(eloHome, eloAway, apiFormHome, apiFormAway, histHome?.competitive, histAway?.competitive, h2h, match.id)
    : null;

  const score = prediction
    ? predictScore(histHome?.competitive, histAway?.competitive, prediction.homeWin / 100)
    : null;

  const homePct = prediction?.homeWin ?? 50;
  const awayPct = prediction?.awayWin ?? 50;
  const isFavoriteHome = homePct >= awayPct;

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col transition-transform duration-150 hover:-translate-y-0.5"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Top bar */}
      <div
        className="px-4 py-2 flex justify-between items-center"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "#c8f000" }}
        >
          MD {matchday}
        </span>
        <div className="flex items-center gap-2 relative">
          {prediction?.usedMarket && (
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded cursor-pointer select-none"
              style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}
              onClick={() => setShowBreakdown(v => !v)}
            >
              📈 Market
            </span>
          )}
          {prediction?.usedForm && !prediction?.usedMarket && (
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded cursor-pointer select-none"
              style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000" }}
              onClick={() => setShowBreakdown(v => !v)}
            >
              AI Model
            </span>
          )}

          {/* ── Prediction breakdown popover ── */}
          {showBreakdown && prediction && (
            <div
              className="absolute right-0 top-7 z-50 rounded-xl p-3 text-xs flex flex-col gap-2"
              style={{ background: "#1a0a2e", border: "1px solid rgba(255,255,255,0.12)", minWidth: 210, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
              onClick={e => e.stopPropagation()}
            >
              <p className="font-black uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.6rem" }}>
                Prediction Breakdown
              </p>

              {/* Model row */}
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: "rgba(255,255,255,0.45)" }}>
                  {prediction.model?.includes("trained") ? "🧠 Trained model" : "🧮 Seed model"}
                </span>
                <span className="font-bold tabular-nums" style={{ color: "#c8f000" }}>
                  {prediction.usedMarket
                    ? `${(prediction.homeWin / 0.45 * 0.45).toFixed(0)}%`  // approx back-calculation
                    : `${prediction.homeWin}%`
                  }
                </span>
              </div>

              {/* Market row */}
              {prediction.usedMarket && (
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>📈 Polymarket odds</span>
                  <span className="font-bold tabular-nums" style={{ color: "#a5b4fc" }}>
                    {prediction.marketOdds?.home}%
                  </span>
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

              {/* Blended result */}
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {prediction.usedMarket ? "Blended (55/45)" : "Final"}
                </span>
                <span className="font-black tabular-nums" style={{ color: "white" }}>
                  {home} {prediction.homeWin}% — {prediction.awayWin}% {away}
                </span>
              </div>

              {/* Model tag */}
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.58rem", marginTop: 2 }}>
                Model: {prediction.model}
              </p>

              <button
                className="text-xs mt-1 self-end"
                style={{ color: "rgba(255,255,255,0.25)" }}
                onClick={() => setShowBreakdown(false)}
              >
                close ✕
              </button>
            </div>
          )}
        </div>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{formattedDate}</span>
        </div>

      {/* Teams */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2 flex-1">
        {/* Home */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0 cursor-pointer group/home"
          onClick={() => openTeam(home)}>
          <FlagEmoji country={home} />
          <span
            className="text-xs font-bold text-center leading-tight line-clamp-2 w-full group-hover/home:underline"
            style={{ color: isFavoriteHome ? "#c8f000" : "rgba(255,255,255,0.5)" }}
          >
            {home}
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              background: isFavoriteHome ? "rgba(200,240,0,0.15)" : "rgba(255,255,255,0.05)",
              color: isFavoriteHome ? "#c8f000" : "rgba(255,255,255,0.3)",
            }}
          >
            {homePct.toFixed(1)}%
          </span>
          <FormDots form={formStrHome} />
        </div>

        {/* Score prediction */}
        <div className="flex flex-col items-center gap-1 shrink-0 px-1">
          {score ? (
            <>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "1.6rem",
                  letterSpacing: "0.08em",
                  lineHeight: 1,
                  color: "white",
                }}
              >
                {score.home} – {score.away}
              </span>
              <span className="text-xs font-medium tracking-wide" style={{ color: "#c8f000", opacity: 0.7 }}>
                predicted · {score.prob}%
              </span>
              {score.alternatives?.length > 0 && (
                <span
                  className="text-center leading-tight"
                  style={{ color: "rgba(255,255,255,0.22)", fontSize: "0.6rem" }}
                >
                  {score.alternatives.slice(0, 2).map(a => a.score).join(" / ")}
                </span>
              )}
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>
                xG {score.xGHome} – {score.xGAway}
              </span>
            </>
          ) : (
            <span className="text-sm font-black" style={{ color: "rgba(255,255,255,0.1)" }}>VS</span>
          )}
          {time && (
            <span className="text-xs whitespace-nowrap mt-0.5" style={{ color: "rgba(255,255,255,0.18)" }}>
              {time}
            </span>
          )}
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0 cursor-pointer group/away"
          onClick={() => openTeam(away)}>
          <FlagEmoji country={away} />
          <span
            className="text-xs font-bold text-center leading-tight line-clamp-2 w-full group-hover/away:underline"
            style={{ color: !isFavoriteHome ? "#c8f000" : "rgba(255,255,255,0.5)" }}
          >
            {away}
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              background: !isFavoriteHome ? "rgba(200,240,0,0.15)" : "rgba(255,255,255,0.05)",
              color: !isFavoriteHome ? "#c8f000" : "rgba(255,255,255,0.3)",
            }}
          >
            {awayPct.toFixed(1)}%
          </span>
          <FormDots form={formStrAway} />
        </div>
      </div>

      {/* H2H strip — clickable */}
      {h2h?.allTime?.played > 0 && (
        <button
          onClick={() => setShowH2H(true)}
          onMouseEnter={() => setH2hHovered(true)}
          onMouseLeave={() => setH2hHovered(false)}
          className="mx-4 mb-2 px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 w-[calc(100%-2rem)] transition-all duration-150"
          style={{
            background: h2hHovered ? "rgba(200,240,0,0.07)"  : "rgba(255,255,255,0.04)",
            border:     h2hHovered ? "1px solid rgba(200,240,0,0.2)" : "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.25)" }}>H2H</span>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span style={{ color: "#c8f000" }}>{h2h.allTime.homeTeamWins}W</span>
            <span style={{ color: "rgba(255,255,255,0.25)" }}>{h2h.allTime.draws}D</span>
            <span style={{ color: "#ef4444" }}>{h2h.allTime.awayTeamWins}L</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              {h2h.allTime.played} meetings
            </span>
            <svg className="w-3 h-3" style={{ color: "rgba(255,255,255,0.2)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      )}

      {/* H2H Modal */}
      {showH2H && h2h && (
        <H2HModal
          h2h={h2h}
          home={home}
          away={away}
          onClose={() => setShowH2H(false)}
        />
      )}

      {/* Probability bar */}
      <div className="px-4 pt-1 pb-3">
        <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="transition-all duration-500"
            style={{ width: `${homePct}%`, background: "linear-gradient(90deg, #c8f000, #84cc16)" }}
          />
          <div
            className="transition-all duration-500"
            style={{ width: `${awayPct}%`, background: "linear-gradient(90deg, #dc2626, #b91c1c)" }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.12)" }}>home</span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.12)" }}>away</span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-4 pb-3 pt-2 flex items-center gap-1.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <svg className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.18)" }} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.18)" }}>{city ?? "TBD"}</span>
      </div>
    </div>
  );
}
