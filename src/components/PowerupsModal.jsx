import { useState } from "react";
import fixtures from "../data/wc2026_fixtures.json";
import { getFlagClass } from "../utils/flags";

const GROUP_MATCHES = fixtures.filter(m => m.group).sort((a, b) => {
  if (a.group !== b.group) return a.group < b.group ? -1 : 1;
  return (a.matchday ?? 0) - (b.matchday ?? 0);
});

const GROUPS = [...new Set(GROUP_MATCHES.map(m => m.group))].sort();

const MAX_2X = 3;
const MAX_3X = 3;

function BoostChip({ level, active, disabled, onClick }) {
  const styles = {
    2: {
      active:   { color: "#f59e0b", bg: "rgba(245,158,11,0.22)", border: "rgba(245,158,11,0.6)" },
      inactive: { color: "rgba(245,158,11,0.45)", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.18)" },
      dim:      { color: "rgba(255,255,255,0.2)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
    },
    3: {
      active:   { color: "#c8f000", bg: "rgba(200,240,0,0.22)", border: "rgba(200,240,0,0.6)" },
      inactive: { color: "rgba(200,240,0,0.45)", bg: "rgba(200,240,0,0.06)", border: "rgba(200,240,0,0.18)" },
      dim:      { color: "rgba(255,255,255,0.2)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
    },
  };
  const s = disabled && !active ? styles[level].dim : active ? styles[level].active : styles[level].inactive;

  return (
    <button
      onClick={disabled && !active ? undefined : onClick}
      className={`rounded font-black tabular-nums px-1.5 text-center transition-all duration-100 ${active ? "scale-105" : ""} ${disabled && !active ? "cursor-not-allowed" : "cursor-pointer active:scale-90"}`}
      style={{ fontSize: "0.65rem", lineHeight: "18px", minWidth: 26, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
      title={active ? `Remove ×${level} boost` : disabled ? `No ×${level} boosts left` : `Apply ×${level} boost — correct pick earns ${level} points`}
    >
      ×{level}
    </button>
  );
}

/**
 * Modal for allocating the 3× ×2 and 3× ×3 powerup boosts across group matches.
 * confidence: { [matchId]: 1 | 2 | 3 }
 * onChange: (newConfidence) => void
 */
export default function PowerupsModal({ confidence, picks, onChange, onClose, readOnly = false }) {
  const [local, setLocal] = useState(() => ({ ...confidence }));

  const used2x = Object.values(local).filter(v => v === 2).length;
  const used3x = Object.values(local).filter(v => v === 3).length;

  function toggle(matchId, level) {
    if (readOnly) return;
    setLocal(prev => {
      const cur = prev[matchId] ?? 1;
      if (cur === level) {
        // deselect
        const next = { ...prev };
        delete next[matchId];
        return next;
      }
      return { ...prev, [matchId]: level };
    });
  }

  function handleSave() {
    onChange(local);
    onClose();
  }

  const remaining2x = MAX_2X - used2x;
  const remaining3x = MAX_3X - used3x;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.92)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
          border: "1px solid rgba(200,240,0,0.15)",
          boxShadow: "0 0 60px rgba(200,240,0,0.07), 0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Boosts</p>
              <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: "white", lineHeight: 1, letterSpacing: "0.04em" }}>
                ⚡ Powerups
              </h2>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                Assign your 3× ×2 and 3× ×3 boosts to any group matches.<br />
                A correct boosted pick earns 2× or 3× points. Wrong picks still score 0.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.07)" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            >✕</button>
          </div>

          {/* Boost inventory */}
          <div className="flex gap-3 mt-4">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <div className="flex gap-1">
                {Array.from({ length: MAX_2X }).map((_, i) => (
                  <span key={i} className="w-4 h-4 rounded-sm"
                    style={{ background: i < used2x ? "#f59e0b" : "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.3)" }} />
                ))}
              </div>
              <div>
                <p className="text-xs font-black" style={{ color: "#f59e0b" }}>×2 Boosts</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{remaining2x} remaining</p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(200,240,0,0.08)", border: "1px solid rgba(200,240,0,0.2)" }}>
              <div className="flex gap-1">
                {Array.from({ length: MAX_3X }).map((_, i) => (
                  <span key={i} className="w-4 h-4 rounded-sm"
                    style={{ background: i < used3x ? "#c8f000" : "rgba(200,240,0,0.18)", border: "1px solid rgba(200,240,0,0.3)" }} />
                ))}
              </div>
              <div>
                <p className="text-xs font-black" style={{ color: "#c8f000" }}>×3 Boosts</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{remaining3x} remaining</p>
              </div>
            </div>
          </div>
        </div>

        {/* Match list */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {GROUPS.map(group => {
            const groupMatches = GROUP_MATCHES.filter(m => m.group === group);
            return (
              <div key={group} className="mb-4">
                <p className="text-xs font-black uppercase tracking-widest mb-2 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Group {group}
                </p>
                <div className="flex flex-col gap-1">
                  {groupMatches.map(m => {
                    const cur = local[m.id] ?? 1;
                    const hasPick = !!picks?.[m.id];
                    const is2x = cur === 2;
                    const is3x = cur === 3;
                    const canAdd2x = remaining2x > 0 || is2x;
                    const canAdd3x = remaining3x > 0 || is3x;

                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{
                          background: is2x ? "rgba(245,158,11,0.07)" : is3x ? "rgba(200,240,0,0.07)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${is2x ? "rgba(245,158,11,0.25)" : is3x ? "rgba(200,240,0,0.25)" : "rgba(255,255,255,0.06)"}`,
                          opacity: !hasPick ? 0.45 : 1,
                        }}
                      >
                        {/* Teams */}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <span className="text-xs font-semibold truncate text-right" style={{ color: "rgba(255,255,255,0.85)" }}>{m.home}</span>
                          <span className={getFlagClass(m.home) ?? ""} style={{ fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }} />
                        </div>
                        <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>vs</span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className={getFlagClass(m.away) ?? ""} style={{ fontSize: "0.9rem", lineHeight: 1, flexShrink: 0 }} />
                          <span className="text-xs font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>{m.away}</span>
                        </div>

                        {/* Pick indicator */}
                        {hasPick && (
                          <span className="text-xs shrink-0 px-1.5 py-0.5 rounded font-bold"
                            style={{
                              background: picks[m.id] === "home" ? "rgba(200,240,0,0.12)" : picks[m.id] === "away" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                              color: picks[m.id] === "home" ? "#c8f000" : picks[m.id] === "away" ? "#ef4444" : "#f59e0b",
                              fontSize: "0.55rem",
                            }}>
                            {picks[m.id] === "home" ? "H" : picks[m.id] === "away" ? "A" : "X"}
                          </span>
                        )}

                        {/* Boost chips */}
                        {!readOnly && hasPick && (
                          <div className="flex gap-1 shrink-0">
                            <BoostChip level={2} active={is2x} disabled={!canAdd2x} onClick={() => toggle(m.id, 2)} />
                            <BoostChip level={3} active={is3x} disabled={!canAdd3x} onClick={() => toggle(m.id, 3)} />
                          </div>
                        )}
                        {(!hasPick) && (
                          <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>pick first</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="px-6 py-4 shrink-0 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {used2x + used3x === 0 ? "No boosts assigned yet" : `${used2x} ×2 and ${used3x} ×3 boosts assigned`}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}>
                Cancel
              </button>
              <button onClick={handleSave}
                className="px-5 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                Save Boosts
              </button>
            </div>
          </div>
        )}
        {readOnly && (
          <div className="px-6 py-4 shrink-0 flex justify-end" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <button onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-black"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
