import { useState, useEffect } from "react";
import { getAllBrackets, createBracket, upsertBracket, deleteBracket } from "../utils/storage";
import fixtures from "../data/wc2026_fixtures.json";

const TOTAL_GROUP_MATCHES = fixtures.length;
const TOTAL_BRACKET_PICKS = 32; // 31 knockout + 3rd place

function completionPct(b) {
  const groupPicks   = Object.keys(b.picks ?? {}).length;
  const bw           = b.bracket ?? {};
  const bracketPicks = ["R32","R16","QF","SF","F"].reduce((s,r)=>s+(bw[r]??[]).filter(Boolean).length,0)
                       + ((bw["3P"]??[null])[0] ? 1 : 0);
  const total = groupPicks + bracketPicks;
  const max   = TOTAL_GROUP_MATCHES + TOTAL_BRACKET_PICKS;
  return Math.round((total / max) * 100);
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
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newMode,   setNewMode]   = useState("winner");
  const [deletingId, setDeletingId] = useState(null);
  const [editingId,  setEditingId]  = useState(null);
  const [editName,   setEditName]   = useState("");
  const [editMode,   setEditMode]   = useState("winner");

  function refresh() { setBrackets(getAllBrackets()); }

  function handleCreate() {
    const name = newName.trim() || "My Bracket";
    const b = createBracket(name, newMode);
    upsertBracket(b);
    setCreating(false);
    setNewName("");
    setNewMode("winner");
    onOpen(b.id);
  }

  function handleDelete(id) {
    deleteBracket(id);
    setDeletingId(null);
    refresh();
  }

  function handleRename(id) {
    const b = getAllBrackets().find(x => x.id === id);
    if (!b) return;
    upsertBracket({ ...b, name: editName.trim() || b.name, mode: editMode });
    setEditingId(null);
    setEditName("");
    setEditMode("winner");
    refresh();
  }

  const isEmpty = brackets.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-white mb-1"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.08em" }}>
            My Brackets
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            Create and manage multiple predictions — each saves automatically
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Bracket
        </button>
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,2,26,0.88)", backdropFilter: "blur(8px)" }}
          onClick={() => setCreating(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "linear-gradient(160deg,#1f0645,#160336)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-black mb-4"
              style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.5rem", letterSpacing: "0.05em" }}>
              Name Your Bracket
            </h3>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Bold Predictions, Safe Picks…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none mb-4"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}
            />
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
              Prediction Mode
            </p>
            <div className="flex gap-2 mb-4">
              {[{ id: "winner", label: "Winner Only", desc: "Pick H / X / A" }, { id: "score", label: "Predict Score", desc: "Enter exact goals" }].map(opt => (
                <button key={opt.id} onClick={() => setNewMode(opt.id)}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all text-left"
                  style={{
                    background: newMode === opt.id ? "rgba(200,240,0,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${newMode === opt.id ? "rgba(200,240,0,0.4)" : "rgba(255,255,255,0.1)"}`,
                    color: newMode === opt.id ? "#c8f000" : "rgba(255,255,255,0.4)",
                  }}>
                  {opt.label}
                  <span className="block font-normal mt-0.5" style={{ color: newMode === opt.id ? "rgba(200,240,0,0.6)" : "rgba(255,255,255,0.2)", fontSize: "0.65rem" }}>
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate}
                className="flex-1 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
                Create &amp; Start
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }}
                className="px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,2,26,0.88)", backdropFilter: "blur(8px)" }}
          onClick={() => setDeletingId(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{ background: "linear-gradient(160deg,#1f0645,#160336)", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}>
            <p className="text-white font-bold mb-1">Delete this bracket?</p>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>This can't be undone.</p>
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
      {isEmpty && (
        <div className="text-center py-16 rounded-2xl"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-white font-bold mb-1">No brackets yet</p>
          <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Create your first bracket and start predicting
          </p>
          <button onClick={() => setCreating(true)}
            className="px-5 py-2.5 rounded-xl font-black text-sm"
            style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
            + New Bracket
          </button>
        </div>
      )}

      {/* Bracket list */}
      <div className="flex flex-col gap-3">
        {brackets.map(b => {
          const pct   = completionPct(b);
          const group = groupCompletion(b);
          const isEditing = editingId === b.id;

          return (
            <div key={b.id}
              className="rounded-2xl overflow-hidden transition-all duration-150"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>

              {/* Main row — click to open */}
              <button
                onClick={() => !isEditing && onOpen(b.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left group transition-all"
                style={{ background: "transparent" }}
                onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = "rgba(200,240,0,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Trophy icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: pct === 100 ? "linear-gradient(135deg,#c8f000,#84cc16)" : "rgba(255,255,255,0.06)" }}>
                  {pct === 100
                    ? <span className="text-lg" style={{ color: "#1a0533" }}>✓</span>
                    : <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1rem", color: "rgba(255,255,255,0.5)" }}>
                        {pct}%
                      </span>
                  }
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(b.id); if (e.key === "Escape") { setEditingId(null); setEditName(""); }}}
                      onClick={e => e.stopPropagation()}
                      className="text-sm font-black text-white bg-transparent outline-none border-b w-full"
                      style={{ borderColor: "#c8f000", paddingBottom: 2 }}
                    />
                  ) : (
                    <p className="text-sm font-black text-white truncate group-hover:text-[#c8f000] transition-colors">
                      {b.name}
                    </p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {group}/{TOTAL_GROUP_MATCHES} group picks · edited {formatDate(b.updatedAt)}
                    {b.mode === "score" && (
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
              <div className="flex flex-col gap-2 px-5 pb-3">
                {isEditing ? (
                  <>
                    <div className="flex gap-2">
                      {[{ id: "winner", label: "Winner Only" }, { id: "score", label: "Score Mode" }].map(opt => (
                        <button key={opt.id} onClick={() => setEditMode(opt.id)}
                          className="text-xs font-bold px-3 py-1 rounded-lg transition-all"
                          style={{
                            background: editMode === opt.id ? "rgba(200,240,0,0.15)" : "rgba(255,255,255,0.05)",
                            color: editMode === opt.id ? "#c8f000" : "rgba(255,255,255,0.35)",
                            border: `1px solid ${editMode === opt.id ? "rgba(200,240,0,0.3)" : "rgba(255,255,255,0.08)"}`,
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleRename(b.id)}
                        className="text-xs font-bold px-3 py-1 rounded-lg"
                        style={{ background: "rgba(200,240,0,0.15)", color: "#c8f000" }}>
                        Save
                      </button>
                      <button onClick={() => { setEditingId(null); setEditName(""); setEditMode("winner"); }}
                        className="text-xs font-semibold px-3 py-1 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button onClick={e => { e.stopPropagation(); setEditingId(b.id); setEditName(b.name); setEditMode(b.mode ?? "winner"); }}
                      className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "white"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}>
                      Edit
                    </button>
                    <button onClick={e => { e.stopPropagation(); setDeletingId(b.id); }}
                      className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
