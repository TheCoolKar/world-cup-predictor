export default function HowItWorksModal({ onClose, onGetStarted }) {
  const steps = [
    {
      num: "1",
      icon: "🗂️",
      title: "Pick Your Groups",
      desc: "Go through all 12 groups and pick the winner of every match — 72 matches total. You can also predict exact scores if you want.",
      accent: "#c8f000",
    },
    {
      num: "2",
      icon: "⚡",
      title: "Bracket Auto-Seeds",
      desc: "Once you've picked a group, your group standings seed the knockout bracket automatically. No manual entry needed.",
      accent: "#c8f000",
    },
    {
      num: "3",
      icon: "🏟️",
      title: "Pick the Knockouts",
      desc: "Click through the Round of 32, R16, Quarter-Finals, Semi-Finals and Final. Pick who advances in each match.",
      accent: "#f59e0b",
    },
    {
      num: "4",
      icon: "🔒",
      title: "Submit Your Bracket",
      desc: "Hit Submit to lock in your official entry. You can edit and re-submit any time before the tournament starts.",
      accent: "#ef4444",
    },
    {
      num: "5",
      icon: "🏆",
      title: "Compete & Climb",
      desc: "As real results come in you earn points. Check the Leaderboard and join private Leagues to compete with friends.",
      accent: "#22c55e",
    },
  ];

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

        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Guide</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1, marginBottom: "1.5rem" }}>
          How It Works
        </h2>

        <div className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-4">
              <div
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                style={{ background: `rgba(${s.accent === "#c8f000" ? "200,240,0" : s.accent === "#f59e0b" ? "245,158,11" : s.accent === "#ef4444" ? "239,68,68" : "34,197,94"},0.12)`, border: `1px solid ${s.accent}30` }}
              >
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-black" style={{ color: s.accent }}>STEP {s.num}</span>
                  <span className="font-bold text-sm text-white">{s.title}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => { onClose(); onGetStarted?.(); }}
          className="w-full mt-8 py-3 rounded-xl font-black text-sm transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", color: "white", boxShadow: "0 0 24px rgba(220,38,38,0.35)" }}
        >
          🏆 Start Predicting
        </button>
      </div>
    </div>
  );
}
