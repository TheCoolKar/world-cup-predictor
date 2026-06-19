import { useState } from "react";
import { useTeamModal } from "../context/TeamModalContext";
import { useModalA11y } from "../hooks/useModalA11y";
import { getFlagClass } from "../utils/flags";
import playerStats from "../data/player_stats.json";

const PHOTO_URL = (id) => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;

// Which stats to surface, by position group. Keys match player_stats.json labels.
const STAT_GROUPS = {
  GK: [
    { heading: "Goalkeeping", keys: ["Clean sheets", "Goals conceded"] },
    { heading: "Distribution", keys: ["Pass accuracy", "Accurate passes", "Long ball accuracy"] },
  ],
  DEF: [
    { heading: "Defending", keys: ["Duels won %", "Aerials won %", "Tackles", "Interceptions", "Clearances", "Recoveries"] },
    { heading: "Passing", keys: ["Pass accuracy", "Accurate passes", "Long ball accuracy"] },
    { heading: "Attacking", keys: ["Goals", "Assists", "Touches in opp. box"] },
  ],
  MID: [
    { heading: "Creativity", keys: ["Assists", "xA", "Chances created", "Big chances created", "Pass accuracy"] },
    { heading: "On the ball", keys: ["Dribble success rate", "Dribbles", "Touches", "Poss. won final 3rd"] },
    { heading: "Defending", keys: ["Duels won %", "Tackles", "Interceptions", "Recoveries"] },
    { heading: "Scoring", keys: ["Goals", "xG", "Shots"] },
  ],
  FWD: [
    { heading: "Scoring", keys: ["Goals", "xG", "Shots", "Shots on target"] },
    { heading: "Creativity", keys: ["Assists", "xA", "Chances created", "Big chances created"] },
    { heading: "On the ball", keys: ["Dribble success rate", "Dribbles", "Touches in opp. box", "Duels won %", "Aerials won %"] },
  ],
};

function posGroup(pos) {
  if (!pos) return "MID";
  const p = pos.toUpperCase();
  if (p.includes("KEEPER") || p === "GK") return "GK";
  if (p.includes("BACK") || p.includes("DEFENDER") || ["CB", "RB", "LB", "RWB", "LWB"].includes(p)) return "DEF";
  if (p.includes("FORWARD") || p.includes("STRIKER") || p.includes("WINGER") || ["ST", "CF", "RW", "LW"].includes(p)) return "FWD";
  return "MID";
}

function pctColor(p) {
  if (p == null) return "rgba(255,255,255,0.25)";
  if (p >= 80) return "#22c55e";
  if (p >= 60) return "#c8f000";
  if (p >= 40) return "#f59e0b";
  return "#ef4444";
}

function StatBar({ label, value, pct }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</span>
      <div className="flex items-center gap-2 shrink-0" style={{ width: 130 }}>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: pctColor(pct) }} />
        </div>
        <span className="text-xs font-black tabular-nums text-right" style={{ color: "white", width: 40 }}>{value}</span>
      </div>
    </div>
  );
}

export default function PlayerModal() {
  const { player, closePlayer } = useTeamModal();
  const [imgOk, setImgOk] = useState(true);
  useModalA11y(player ? closePlayer : null);
  if (!player) return null;

  const data = playerStats[player.id] ?? playerStats[String(player.id)] ?? null;
  const name = data?.name ?? player.name;
  const group = posGroup(data?.pos ?? player.pos);
  const groups = STAT_GROUPS[group] ?? STAT_GROUPS.MID;
  const hasStats = data && Object.keys(data.stats ?? {}).length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(10,2,26,0.9)", backdropFilter: "blur(10px)" }}
      onClick={closePlayer}>

      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        role="dialog" aria-modal="true" aria-label={`${name} player profile`}
        style={{
          background: "linear-gradient(160deg,#1f0645 0%,#160336 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 px-6 pt-6 pb-4"
          style={{ background: "linear-gradient(160deg,#1f0645,#1a0533)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={closePlayer} aria-label="Close player profile"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>
            ✕
          </button>

          <div className="flex items-center gap-4">
            <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center"
              style={{ width: 72, height: 72, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {imgOk ? (
                <img src={PHOTO_URL(player.id)} alt={name} width={72} height={72}
                  style={{ objectFit: "cover" }} onError={() => setImgOk(false)} />
              ) : (
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.6rem", color: "rgba(255,255,255,0.4)" }}>
                  {name?.[0] ?? "?"}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {data?.team && <span className={getFlagClass(data.team) ?? ""} style={{ fontSize: "1rem" }} />}
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c8f000" }}>
                  {data?.pos ?? player.pos}{data?.shirt ? ` · #${data.shirt}` : ""}{data?.captain ? " · ©" : ""}
                </p>
              </div>
              <h2 className="text-white leading-none"
                style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.9rem", letterSpacing: "0.03em" }}>
                {name}
              </h2>
              <p className="text-xs mt-1 font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                {[data?.club ?? player.club, data?.age ? `${data.age} yrs` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {/* Top-line: rating / matches / minutes */}
          {data && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: "Rating", value: data.rating ?? "—", accent: "#c8f000" },
                { label: "Apps", value: data.matches ?? "—" },
                { label: "Minutes", value: data.minutes ?? "—" },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-2.5 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="font-black leading-none" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.3rem", color: s.accent ?? "white" }}>
                    {s.value}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {data?.league && (
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              Season stats · {data.league} {data.season} · bars show percentile vs peers
            </p>
          )}

          {hasStats ? (
            groups.map(({ heading, keys }) => {
              const rows = keys.filter(k => data.stats[k]);
              if (!rows.length) return null;
              return (
                <section key={heading}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "rgba(200,240,0,0.6)" }}>
                    {heading}
                  </p>
                  <div className="rounded-xl px-4 py-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {rows.map(k => (
                      <StatBar key={k} label={k} value={data.stats[k].v} pct={data.stats[k].p} />
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📊</div>
              <p className="text-sm font-bold text-white mb-1">No detailed stats available</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                {name} doesn't have published season stats yet.
              </p>
            </div>
          )}

          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.2)" }}>
            Stats via FotMob · current club season
          </p>
        </div>
      </div>
    </div>
  );
}
