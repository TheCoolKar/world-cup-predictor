export default function BracketScoringModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.92)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{
          background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >✕</button>

        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#f59e0b" }}>Scoring Guide</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1, marginBottom: "0.4rem" }}>
          Knockout Scoring
        </h2>
        <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
          Your knockout bracket earns two types of points, added together into one total.
        </p>

        {/* Part 1: Exact picks */}
        <div className="mb-4 p-4 rounded-xl" style={{ background: "rgba(200,240,0,0.05)", border: "1px solid rgba(200,240,0,0.15)" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "#c8f000" }}>Part 1 — Exact match picks</p>
          <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.8)" }}>
            Predict the correct winner of a specific match and you earn points. Later rounds are worth more:
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Round of 32", pts: "1 pt" },
              { label: "Round of 16", pts: "2 pts" },
              { label: "Quarter-Final", pts: "4 pts" },
              { label: "Semi-Final", pts: "8 pts" },
              { label: "Final", pts: "16 pts" },
            ].map(({ label, pts }) => (
              <div key={label} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(200,240,0,0.08)", border: "1px solid rgba(200,240,0,0.18)" }}>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
                <span className="text-xs font-black" style={{ color: "#c8f000" }}>{pts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Void explanation */}
        <div className="mb-4 p-4 rounded-xl" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.18)" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "#a5b4fc" }}>What if a team I picked got knocked out early?</p>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            If a team gets eliminated before a match you predicted them for, that pick is marked <strong style={{ color: "#a5b4fc" }}>void</strong> — it doesn't count for or against you. A void isn't a wrong answer; it's a matchup that simply couldn't happen.
          </p>
        </div>

        {/* Part 2: Survivor points */}
        <div className="mb-4 p-4 rounded-xl" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "#22c55e" }}>Part 2 — Survivor bonus</p>
          <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.8)" }}>
            You also earn bonus points just for correctly predicting which teams were still alive at each stage — even if you got the exact matchups wrong. This rewards a good overall tournament read, not just a perfect bracket path.
          </p>
          <div className="flex flex-col gap-2">
            {[
              { label: "Each team you correctly called into the Round of 16", pts: "1 pt", max: "max 16 pts" },
              { label: "Each team correctly into the Quarter-Finals", pts: "2 pts", max: "max 16 pts" },
              { label: "Each team correctly into the Semi-Finals", pts: "4 pts", max: "max 16 pts" },
              { label: "Each team correctly into the Final", pts: "8 pts", max: "max 16 pts" },
            ].map(({ label, pts, max }) => (
              <div key={label} className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-black mt-0.5" style={{ color: "#22c55e", minWidth: 40 }}>{pts}</span>
                <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {label} <span style={{ color: "rgba(255,255,255,0.3)" }}>({max})</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3 pt-3" style={{ color: "rgba(255,255,255,0.35)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            Maximum possible survivor bonus: 64 pts
          </p>
        </div>

        {/* Combined score */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)" }}>
          <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "#f59e0b" }}>Your total score on the leaderboard</p>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
            Group stage points + Exact match pick points + Survivor bonus — all added into the single score shown in the rankings.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
