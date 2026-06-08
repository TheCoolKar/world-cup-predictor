/**
 * SignInGate.jsx
 *
 * Shown instead of AI-prediction content (Group Stage / Bracket) when
 * the visitor is not signed in. Communicates the value prop and gives
 * them quick paths to sign up or log in.
 */

export default function SignInGate({ tab = "groups", onSignIn, onSignUp }) {

  const features = [
    { icon: "🤖", title: "AI Match Predictions", desc: "Win probabilities for all 104 matches powered by ELO ratings, historical stats, and live Polymarket odds." },
    { icon: "📈", title: "Live Market Odds",      desc: "Predictions blended 55/45 with real Polymarket odds — updated in real time as betting markets move." },
    { icon: "⚽", title: "Score Forecasts",       desc: "Predicted scorelines with alternative scores and xG data for every group-stage game." },
    { icon: "🏆", title: "Full Bracket Sim",      desc: "See who the model thinks wins the entire tournament, right through to the Final." },
  ];

  const tabLabel = tab === "bracket" ? "Simulated Bracket" : "Group Stage Predictions";

  return (
    <div
      className="flex flex-col items-center justify-start w-full min-h-[calc(100vh-120px)] px-4 py-12"
      style={{ background: "#1a0533" }}
    >
      {/* ── Lock icon ── */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shrink-0"
        style={{
          background: "rgba(200,240,0,0.08)",
          border: "1px solid rgba(200,240,0,0.2)",
          boxShadow: "0 0 32px rgba(200,240,0,0.1)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c8f000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>

      {/* ── Heading ── */}
      <p
        className="text-center font-black mb-2"
        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(1.8rem,5vw,2.6rem)", color: "white", letterSpacing: "0.06em", lineHeight: 1 }}
      >
        Members Only
      </p>
      <p className="text-sm text-center mb-1" style={{ color: "rgba(255,255,255,0.7)", maxWidth: 380 }}>
        <span style={{ color: "#c8f000", fontWeight: 700 }}>{tabLabel}</span> is available to registered users.
      </p>
      <p className="text-xs text-center mb-8" style={{ color: "rgba(255,255,255,0.55)", maxWidth: 340 }}>
        Create a free account in seconds — no credit card required.
      </p>

      {/* ── CTAs ── */}
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={onSignUp}
          className="px-6 py-3 rounded-xl font-black text-sm transition-all duration-150 active:scale-95"
          style={{
            background: "linear-gradient(135deg,#c8f000,#84cc16)",
            color: "#1a0533",
            boxShadow: "0 0 24px rgba(200,240,0,0.35)",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          Create Free Account
        </button>
        <button
          onClick={onSignIn}
          className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-150"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
        >
          Sign In
        </button>
      </div>

      {/* ── Feature cards ── */}
      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
        {features.map(({ icon, title, desc }) => (
          <div
            key={title}
            className="rounded-xl p-4 flex items-start gap-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <span className="text-xl leading-none shrink-0 mt-0.5">{icon}</span>
            <div>
              <p className="text-xs font-bold mb-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>{title}</p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Fine print ── */}
      <p className="text-xs mt-8 text-center" style={{ color: "rgba(255,255,255,0.15)", maxWidth: 340 }}>
        Predictions are for entertainment only. See Terms &amp; Disclaimer for full details.
      </p>
    </div>
  );
}
