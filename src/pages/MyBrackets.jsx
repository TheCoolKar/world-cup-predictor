import { useState } from "react";
import { getAllBrackets, createBracket, upsertBracket, deleteBracket } from "../utils/storage";
import fixtures from "../data/wc2026_fixtures.json";

const TOTAL_GROUP_MATCHES = fixtures.length;
const TOTAL_BRACKET_PICKS = 32;

function completionPct(b) {
  const groupPicks   = Object.keys(b.picks ?? {}).length;
  const bw           = b.bracket ?? {};
  const bracketPicks = ["R32","R16","QF","SF","F"].reduce((s,r)=>s+(bw[r]??[]).filter(Boolean).length,0)
                       + ((bw["3P"]??[null])[0] ? 1 : 0);
  return Math.round(((groupPicks + bracketPicks) / (TOTAL_GROUP_MATCHES + TOTAL_BRACKET_PICKS)) * 100);
}

function groupCompletion(b) {
  return Object.keys(b.picks ?? {}).length;
}

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MyBrackets({ onOpen }) {
  const [brackets, setBrackets] = useState(() => getAllBrackets());
  const [deletingId, setDeletingId] = useState(null);

  function refresh() { setBrackets(getAllBrackets()); }

  function handleCreate() {
    const b = createBracket("My Bracket", "winner");
    upsertBracket(b);
    refresh();
    onOpen(b.id);
  }

  function handleDelete(id) {
    deleteBracket(id);
    setDeletingId(null);
    refresh();
  }

  const bracket = brackets[0] ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-white mb-1"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}>
          My Bracket
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Your prediction bracket — saves automatically as you pick
        </p>
      </div>

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,2,26,0.88)", backdropFilter: "blur(8px)" }}
          onClick={() => setDeletingId(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{ background: "linear-gradient(160deg,#1f0645,#160336)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-white font-bold mb-1">Delete your bracket?</p>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>This can't be undone. All your picks will be lost.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => handleDelete(deletingId)}
                className="px-5 py-2 rounded-xl font-black text-sm"
                style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", color: "white" }}>
                Delete
              </button>
              <button onClick={() => setDeletingId(null)}
                className="px-5 py-2 rounded-xl font-semibold text-sm"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!bracket && (
        <div className="text-center py-16 rounded-2xl"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-white font-bold mb-1">No bracket yet</p>
          <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Create your bracket and start predicting the World Cup
          </p>
          <button onClick={handleCreate}
            className="px-5 py-2.5 rounded-xl font-black text-sm"
            style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
            Create My Bracket
          </button>
        </div>
      )}

      {/* Single bracket card */}
      {bracket && (() => {
        const pct   = completionPct(bracket);
        const group = groupCompletion(bracket);
        return (
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>

            {/* Main row */}
            <button
              onClick={() => onOpen(bracket.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left group transition-all"
              style={{ background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(200,240,0,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {/* Completion circle */}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: pct === 100 ? "linear-gradient(135deg,#c8f000,#84cc16)" : "rgba(255,255,255,0.06)" }}>
                {pct === 100
                  ? <span className="text-lg" style={{ color: "#1a0533" }}>✓</span>
                  : <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.5)" }}>{pct}%</span>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white truncate group-hover:text-[#c8f000] transition-colors">
                  My Bracket
                </p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {group}/{TOTAL_GROUP_MATCHES} group picks · edited {formatDate(bracket.updatedAt)}
                  {bracket.mode === "score" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", fontSize: "0.6rem" }}>Score mode</span>
                  )}
                </p>
              </div>

              {/* Progress bar */}
              <div className="hidden sm:block w-24 shrink-0">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg,#c8f000,#84cc16)" : "linear-gradient(90deg,#60a5fa,#3b82f6)" }} />
                </div>
                <p className="text-xs mt-1 text-right tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>{pct}%</p>
              </div>

              <svg className="w-4 h-4 shrink-0 opacity-30 group-hover:opacity-100 transition-opacity"
                style={{ color: "#c8f000" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            {/* Action bar */}
            <div className="flex gap-2 px-5 pb-3">
              <button onClick={() => onOpen(bracket.id)}
                className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}>
                Edit Picks
              </button>
              <button onClick={() => setDeletingId(bracket.id)}
                className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}>
                Delete
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
