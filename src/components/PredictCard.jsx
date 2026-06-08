import { setPick } from "../utils/storage";
import { getFlagClass } from "../utils/flags";

function FlagEmoji({ country }) {
  return <span className={getFlagClass(country) ?? ''} style={{fontSize:'1.5rem',lineHeight:1,display:'inline-block',flexShrink:0}} />;
}

const OPTIONS = [
  { value: "home", label: "Home Win" },
  { value: "draw", label: "Draw"     },
  { value: "away", label: "Away Win" },
];

const OPTION_STYLES = {
  home: { active: { background: "#c8f000", color: "#0a0014" }, glow: "#c8f000" },
  draw: { active: { background: "#f59e0b", color: "#0a0014" }, glow: "#f59e0b" },
  away: { active: { background: "#ef4444", color: "#fff"    }, glow: "#ef4444" },
};

export default function PredictCard({ match, pick, onPick }) {
  const { id, home, away, date, matchday } = match;

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });

  function handlePick(value) {
    const next = pick === value ? null : value;
    setPick(id, next);
    onPick(id, next);
  }

  const isPicked = pick != null;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: isPicked ? "rgba(200,240,0,0.05)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isPicked ? "rgba(200,240,0,0.18)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 flex justify-between items-center"
        style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c8f000" }}>
          MD {matchday}
        </span>
        <div className="flex items-center gap-2">
          {isPicked && (
            <span className="text-xs font-bold" style={{ color: "#c8f000" }}>✓</span>
          )}
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{formattedDate}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <FlagEmoji country={home} />
          <span
            className="text-xs font-bold text-center leading-tight line-clamp-2 w-full"
            style={{ color: pick === "home" ? "#c8f000" : pick ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)" }}
          >
            {home}
          </span>
        </div>

        <span className="text-xs font-black shrink-0" style={{ color: "rgba(255,255,255,0.1)" }}>VS</span>

        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <FlagEmoji country={away} />
          <span
            className="text-xs font-bold text-center leading-tight line-clamp-2 w-full"
            style={{ color: pick === "away" ? "#ef4444" : pick ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)" }}
          >
            {away}
          </span>
        </div>
      </div>

      {/* Pick buttons */}
      <div className="px-3 pb-3 grid grid-cols-3 gap-1.5">
        {OPTIONS.map(({ value, label }) => {
          const isActive = pick === value;
          const s = OPTION_STYLES[value];
          return (
            <button
              key={value}
              onClick={() => handlePick(value)}
              className="py-2 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95"
              style={
                isActive
                  ? { ...s.active, boxShadow: `0 0 10px ${s.glow}44` }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
