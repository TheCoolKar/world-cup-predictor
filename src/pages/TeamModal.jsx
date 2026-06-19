import { useTeamModal } from "../context/TeamModalContext";
import { useModalA11y } from "../hooks/useModalA11y";
import { getFlagClass } from '../utils/flags';
import eloRatings from "../data/elo_ratings.json";
import teamForm   from "../data/team_form.json";
import history    from "../data/team_history.json";
import lineups    from "../data/team_lineups.json";

// All ELO values sorted to derive rank
const ELO_ENTRIES = Object.entries(eloRatings)
  .filter(([k]) => !k.startsWith("_"))
  .sort((a, b) => b[1] - a[1]);

function getEloRank(name) {
  const idx = ELO_ENTRIES.findIndex(([k]) => k === name);
  return idx === -1 ? "—" : idx + 1;
}

function FormDot({ result }) {
  const color =
    result === "W" ? "#c8f000" :
    result === "D" ? "#f59e0b" :
    result === "L" ? "#ef4444" : "rgba(255,255,255,0.1)";
  const label = result === "W" ? "Win" : result === "D" ? "Draw" : result === "L" ? "Loss" : "—";
  return (
    <div title={label}
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
      style={{ background: color, color: result ? "#1a0533" : "rgba(255,255,255,0.15)" }}>
      {result || "·"}
    </div>
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <span className="text-xs font-black" style={{ color: accent ?? "white" }}>{value}</span>
    </div>
  );
}

export default function TeamModal() {
  const { team, closeTeam, openTeam, openPlayer } = useTeamModal();
  useModalA11y(team ? closeTeam : null);
  if (!team) return null;

  const elo      = eloRatings[team] ?? "—";
  const rank     = getEloRank(team);
  const form     = teamForm[team] ?? {};
  const hist     = history[team] ?? null;
  const lineup   = lineups[team] ?? null;
  const recentForm = (form.recentForm || "").split("").filter(Boolean);

  // ELO bar (scale 1200–2000)
  const eloMin = 1200, eloMax = 2000;
  const eloPct = Math.round(((elo - eloMin) / (eloMax - eloMin)) * 100);

  // AI summary paragraph
  function aiSummary() {
    const rankWord = rank <= 5 ? "one of the tournament favourites" :
                     rank <= 15 ? "a strong contender" :
                     rank <= 25 ? "a competitive mid-tier side" :
                     rank <= 35 ? "an underdog with potential" : "a significant underdog";
    const formWord = form.winRate >= 0.65 ? "excellent recent form" :
                     form.winRate >= 0.45 ? "decent recent form" :
                     form.played > 0      ? "inconsistent recent results" : "limited recent data";
    const histWord = !hist ? "" :
                     hist.titles > 0 ? `With ${hist.titles} World Cup title${hist.titles > 1 ? "s" : ""}, they carry genuine pedigree.` :
                     hist.best === "Runner-up" ? "Twice finalists, they know how to go deep in tournaments." :
                     hist.best === "4th Place" || hist.best === "3rd Place" ? `They've reached the semi-finals before and will look to do it again.` :
                     hist.appearances === 0 ? "This is their World Cup debut — a historic moment for the nation." :
                     `Their best finish is ${hist.best} — expect a motivated squad looking to improve on that.`;
    return `${team} enter the 2026 World Cup as ${rankWord} (ELO #${rank}) with ${formWord}. ${histWord}`;
  }

  const posOrder = ["GK","RB","CB","LB","RWB","LWB","CM","DM","AM","RW","LW","ST"];
  const groupedPlayers = lineup?.players?.reduce((acc, p) => {
    (acc[p.pos] = acc[p.pos] || []).push(p);
    return acc;
  }, {}) ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(10,2,26,0.88)", backdropFilter: "blur(10px)" }}
      onClick={closeTeam}>

      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        role="dialog" aria-modal="true" aria-label={`${team} team profile`}
        style={{
          background: "linear-gradient(160deg,#1f0645 0%,#160336 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 px-6 pt-6 pb-4"
          style={{ background: "linear-gradient(160deg,#1f0645,#1a0533)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={closeTeam} aria-label="Close team profile"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", fontSize: "0.75rem" }}
            onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.14)"; e.currentTarget.style.color="#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.color="rgba(255,255,255,0.4)"; }}>
            ✕
          </button>

          <div className="flex items-center gap-4">
            <span className={getFlagClass(team) ?? ''} style={{fontSize:'3.5rem',lineHeight:1,display:'inline-block',flexShrink:0}} />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "#c8f000" }}>
                FIFA World Cup 2026
              </p>
              <h2 className="text-white leading-none"
                style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "2rem", letterSpacing: "0.04em" }}>
                {team}
              </h2>
              <p className="text-xs mt-1 font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
                ELO Rank #{rank} · {elo} pts
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">

          {/* ── ELO ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>ELO Rating</p>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-black" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "2rem", color: "#c8f000", lineHeight: 1 }}>
                {elo}
              </span>
              <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
                #{rank} of {ELO_ENTRIES.length} teams
              </span>
            </div>
            <div className="rounded-full overflow-hidden h-2" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${eloPct}%`, background: "linear-gradient(90deg,#c8f000,#22c55e)" }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Weakest</span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Strongest</span>
            </div>
          </section>

          {/* ── Recent Form ── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>Recent Form</p>
            {form.played > 0 ? (
              <>
                <div className="flex gap-2 mb-3">
                  {recentForm.length > 0
                    ? recentForm.map((r, i) => <FormDot key={i} result={r} />)
                    : Array(5).fill(null).map((_, i) => <FormDot key={i} result={null} />)
                  }
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Played",   value: form.played },
                    { label: "Wins",     value: form.wins,   accent: "#c8f000" },
                    { label: "Draws",    value: form.draws,  accent: "#f59e0b" },
                    { label: "Losses",   value: form.losses, accent: "#ef4444" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="font-black text-lg leading-none" style={{ fontFamily: "'Bebas Neue',sans-serif", color: s.accent ?? "white" }}>{s.value}</p>
                      <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>No recent form data available.</p>
            )}
          </section>

          {/* ── Historical WC ── */}
          {hist && (
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>World Cup History</p>
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <StatRow label="Appearances"  value={hist.appearances === 0 ? "Debut 🎉" : hist.appearances} />
                <StatRow label="Best finish"  value={hist.best} accent={hist.titles > 0 ? "#c8f000" : "white"} />
                {hist.titles > 0 && <StatRow label="Titles" value={`🏆 × ${hist.titles}`} accent="#c8f000" />}
                <StatRow label="Total goals"  value={hist.goals} />
                {hist.years.length > 0 && (
                  <div className="pt-2 mt-1">
                    <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>Previous appearances</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hist.years.map(y => (
                        <span key={y} className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "rgba(200,240,0,0.08)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.15)" }}>
                          {y}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Official Squad ── */}
          {lineup?.players?.length > 0 && (
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>World Cup Squad</p>
              <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.2)" }}>
                {[lineup.coach, `${lineup.players.length} players`].filter(Boolean).join(" · ")} · tap a player for stats
              </p>
              <div className="flex flex-col gap-1">
                {posOrder.filter(pos => groupedPlayers[pos]).map(pos => (
                  <div key={pos}>
                    {groupedPlayers[pos].map(p => {
                      const clickable = p.id != null;
                      return (
                        <button key={p.name}
                          type="button"
                          disabled={!clickable}
                          onClick={() => clickable && openPlayer({ id: p.id, name: p.name, pos, club: p.club, age: p.age })}
                          title={clickable ? `View ${p.name}'s stats` : undefined}
                          className="w-full text-left flex items-center gap-3 py-1.5 px-3 rounded-lg transition-colors group"
                          style={{ background: "rgba(255,255,255,0.02)", cursor: clickable ? "pointer" : "default" }}
                          onMouseEnter={e => { if (clickable) e.currentTarget.style.background = "rgba(200,240,0,0.07)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}>
                          <span className="text-xs font-black w-8 shrink-0"
                            style={{ color: pos === "GK" ? "#f59e0b" : pos.includes("B") ? "#60a5fa" : pos === "ST" ? "#ef4444" : "#c8f000" }}>
                            {pos}
                          </span>
                          <span className="text-sm font-semibold flex-1 text-white group-hover:text-[#c8f000] transition-colors">{p.name}</span>
                          <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>{p.club}</span>
                          <span className="text-xs shrink-0 w-6 text-right" style={{ color: "rgba(255,255,255,0.2)" }}>{p.age}</span>
                          {clickable && (
                            <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: "#c8f000" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 18l6-6-6-6" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── AI Summary ── */}
          <section className="rounded-xl p-4"
            style={{ background: "rgba(200,240,0,0.04)", border: "1px solid rgba(200,240,0,0.12)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-black px-1.5 py-0.5 rounded"
                style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000", fontSize: "0.6rem", letterSpacing: "0.08em" }}>
                AI
              </span>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(200,240,0,0.6)" }}>
                AI Summary
              </p>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              {aiSummary()}
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
