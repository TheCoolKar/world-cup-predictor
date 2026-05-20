import { useState }       from "react";
import { predictMatch }  from "../utils/Predictions";
import eloRatings        from "../data/elo_ratings.json";
import teamForm          from "../data/team_form.json";
import historicalStats   from "../data/team_historical_stats.json";
import h2hStats          from "../data/h2h_stats.json";
import H2HModal          from "./H2HModal";

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

function FlagEmoji({ country }) {
  const code = FLAG_CODES[country];
  if (!code) return <span className="text-2xl">🏳️</span>;
  if (code === "gb-sct") return <span className="text-2xl leading-none">🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
  if (code === "gb-eng") return <span className="text-2xl leading-none">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
  const flag = code.toUpperCase().split("").map((c) =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  ).join("");
  return <span className="text-2xl leading-none">{flag}</span>;
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
  const [showH2H,    setShowH2H]    = useState(false);
  const [h2hHovered, setH2hHovered] = useState(false);
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
    ? predictMatch(eloHome, eloAway, apiFormHome, apiFormAway, histHome?.competitive, histAway?.competitive)
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
        <div className="flex items-center gap-2">
          {prediction?.usedForm && (
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000" }}
            >
              ELO + Form
            </span>
          )}
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{formattedDate}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2 flex-1">
        {/* Home */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <FlagEmoji country={home} />
          <span
            className="text-xs font-bold text-center leading-tight line-clamp-2 w-full"
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

        {/* VS */}
        <div className="flex flex-col items-center gap-0.5 shrink-0 px-1">
          <span className="text-sm font-black" style={{ color: "rgba(255,255,255,0.1)" }}>VS</span>
          {time && <span className="text-xs whitespace-nowrap" style={{ color: "rgba(255,255,255,0.18)" }}>{time}</span>}
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <FlagEmoji country={away} />
          <span
            className="text-xs font-bold text-center leading-tight line-clamp-2 w-full"
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
