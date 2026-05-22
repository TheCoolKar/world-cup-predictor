import { useState }  from "react";
import GroupStage   from "./pages/GroupStage";
import Bracket      from "./pages/Bracket";
import MyBracket    from "./pages/MyBracket";
import Rules        from "./pages/Rules";
import Admin        from "./pages/Admin";
import banner from "./assets/worldcupbanner.webp";
import trophy from "./assets/worldcuppng.webp";
import "./index.css";

const HOST_NATIONS = [
  { name: "USA",    flag: "🇺🇸" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "Mexico", flag: "🇲🇽" },
];

export default function App() {
  const [activeTab,  setActiveTab]  = useState("ai");
  const [aiSubTab,   setAiSubTab]   = useState("groups");
  const [showRules,  setShowRules]  = useState(false);
  const [showAdmin,  setShowAdmin]  = useState(false);

  const inMyBracket = activeTab === "mine";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#1a0533" }}>

      {/* ── Hero banner ── */}
      <header className="relative overflow-hidden" style={{ minHeight: inMyBracket ? 220 : 380 }}>
        <img
          src={banner}
          alt="FIFA World Cup 2026"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(15,4,40,0.88) 0%, rgba(15,4,40,0.6) 55%, rgba(15,4,40,0.15) 100%)" }}
        />

        <div
          className="relative max-w-4xl mx-auto px-6 py-10 flex items-center gap-8 h-full"
          style={{ minHeight: inMyBracket ? 220 : 380 }}
        >
          {/* Trophy */}
          {!inMyBracket && (
            <div className="shrink-0 hidden sm:block">
              <img
                src={trophy}
                alt="FIFA World Cup Trophy"
                className="w-32 h-32 object-contain"
                style={{ mixBlendMode: "luminosity", filter: "drop-shadow(0 0 24px rgba(200,240,0,0.25))" }}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 flex-1">
            {inMyBracket ? (
              /* ── Compact header when inside My Bracket ── */
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => setActiveTab("ai")}
                  className="text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.8)"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"}
                >
                  ← AI Predictions
                </button>
                <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.15)" }} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#ef4444" }}>
                    Your Bracket
                  </p>
                  <h2
                    className="text-white leading-none"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.06em" }}
                  >
                    Make My Bracket
                  </h2>
                </div>
                <div className="w-px h-4 hidden sm:block" style={{ background: "rgba(255,255,255,0.15)" }} />
                <button
                  onClick={() => setShowRules(true)}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-all"
                  style={{
                    background: "rgba(200,240,0,0.08)",
                    border: "1px solid rgba(200,240,0,0.2)",
                    color: "rgba(200,240,0,0.7)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,240,0,0.15)"; e.currentTarget.style.color = "#c8f000"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(200,240,0,0.08)"; e.currentTarget.style.color = "rgba(200,240,0,0.7)"; }}
                >
                  🏆 Rules & Prize
                </button>
              </div>
            ) : (
              /* ── Full hero ── */
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-1" style={{ color: "#c8f000" }}>
                    Match Predictor
                  </p>
                  <h1
                    className="text-white leading-none"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(2.8rem, 8vw, 5rem)", letterSpacing: "0.04em", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
                  >
                    FIFA World Cup
                  </h1>
                  <h1
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(2.8rem, 8vw, 5rem)", letterSpacing: "0.04em", lineHeight: 1, background: "linear-gradient(90deg, #c8f000, #a3e635)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                  >
                    2026
                  </h1>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Hosted by</span>
                  {HOST_NATIONS.map((n) => (
                    <div key={n.name} className="flex items-center gap-1.5 rounded-full px-3 py-1"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <span className="text-sm leading-none">{n.flag}</span>
                      <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{n.name}</span>
                    </div>
                  ))}
                </div>

                {/* ── BIG CTA ── */}
                <div className="mt-1">
                  <button
                    onClick={() => setActiveTab("mine")}
                    className="group relative inline-flex items-center gap-3 rounded-2xl px-6 py-4 font-black transition-all duration-200 active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                      boxShadow: "0 0 32px rgba(220,38,38,0.55), 0 4px 16px rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,100,100,0.3)",
                      animation: "ctaPulse 2.5s ease-in-out infinite",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "linear-gradient(135deg, #ef4444, #dc2626)";
                      e.currentTarget.style.boxShadow = "0 0 48px rgba(239,68,68,0.7), 0 4px 20px rgba(0,0,0,0.4)";
                      e.currentTarget.style.animation = "none";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "linear-gradient(135deg, #dc2626, #b91c1c)";
                      e.currentTarget.style.boxShadow = "0 0 32px rgba(220,38,38,0.55), 0 4px 16px rgba(0,0,0,0.4)";
                      e.currentTarget.style.animation = "ctaPulse 2.5s ease-in-out infinite";
                    }}
                  >
                    {/* Trophy icon */}
                    <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>🏆</span>

                    <div className="text-left">
                      <div
                        className="text-white leading-none"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", letterSpacing: "0.06em" }}
                      >
                        WIN $1,000
                      </div>
                      <div className="text-xs font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.75)", letterSpacing: "0.04em" }}>
                        Predict the group stage correctly →
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1"
                      style={{ color: "rgba(255,255,255,0.7)" }}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>

                  <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Make your picks · Submit your bracket · Compete for the prize
                  </p>
                  <button
                    onClick={() => setShowRules(true)}
                    className="text-xs mt-1 underline underline-offset-2 transition-colors"
                    style={{ color: "rgba(200,240,0,0.45)" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                    onMouseLeave={e => e.currentTarget.style.color = "rgba(200,240,0,0.45)"}
                  >
                    View Rules & Prize Details →
                  </button>
                </div>

              </>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-10" style={{ background: "linear-gradient(to bottom, transparent, #1a0533)" }} />
      </header>

      {/* Pulse keyframe injected via a style tag */}
      <style>{`
        @keyframes ctaPulse {
          0%, 100% { box-shadow: 0 0 32px rgba(220,38,38,0.55), 0 4px 16px rgba(0,0,0,0.4); }
          50%       { box-shadow: 0 0 52px rgba(239,68,68,0.8),  0 4px 20px rgba(0,0,0,0.4); }
        }
      `}</style>

      {/* ── Tab bar (AI only — hidden in MyBracket) ── */}
      {!inMyBracket && (
        <div
          className="sticky top-0 z-40"
          style={{ background: "rgba(26,5,51,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          {/* Identity strip */}
          <div className="py-1.5 px-4" style={{ background: "rgba(200,240,0,0.04)", borderBottom: "1px solid rgba(200,240,0,0.07)" }}>
            <div className="max-w-4xl mx-auto flex items-center gap-2">
              <span
                className="text-xs font-black px-1.5 py-0.5 rounded"
                style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000", fontSize: "0.6rem", letterSpacing: "0.08em" }}
              >
                AI
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(200,240,0,0.45)" }}>
                AI Predictions — ELO ratings + form data
              </span>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="max-w-4xl mx-auto px-4 flex">
            {[
              { id: "groups",  label: "Group Stage" },
              { id: "bracket", label: "Simulated Bracket" },
            ].map((sub) => (
              <button
                key={sub.id}
                onClick={() => setAiSubTab(sub.id)}
                className="px-5 py-3 text-sm font-semibold transition-all duration-150"
                style={{
                  color: aiSubTab === sub.id ? "#c8f000" : "rgba(255,255,255,0.35)",
                  borderBottom: aiSubTab === sub.id ? "2px solid #c8f000" : "2px solid transparent",
                  background: "transparent",
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* My Bracket identity strip */}
      {inMyBracket && (
        <div className="py-1.5 px-4 sticky top-0 z-40"
          style={{ background: "rgba(220,38,38,0.08)", borderBottom: "1px solid rgba(220,38,38,0.12)", backdropFilter: "blur(12px)" }}>
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <span
              className="text-xs font-black px-1.5 py-0.5 rounded"
              style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444", fontSize: "0.6rem", letterSpacing: "0.08em" }}
            >
              YOU
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(239,68,68,0.5)" }}>
              Your Predictions — picks saved locally
            </span>
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowRules(true)}
                className="text-xs font-semibold transition-colors"
                style={{ color: "rgba(200,240,0,0.5)" }}
                onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(200,240,0,0.5)"}
              >
                🏆 Rules & Prize
              </button>
              <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.15)" }} />
              <button
                onClick={() => setActiveTab("ai")}
                className="text-xs font-semibold transition-colors"
                style={{ color: "rgba(255,255,255,0.3)" }}
                onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
              >
                ← AI Predictions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1" style={{ background: "#1a0533" }}>
        {activeTab === "ai" && aiSubTab === "groups"  && <GroupStage />}
        {activeTab === "ai" && aiSubTab === "bracket" && <Bracket />}
        {activeTab === "mine" && <MyBracket />}
      </main>

      {/* ── Rules modal ── */}
      {showRules && <Rules onClose={() => setShowRules(false)} />}

      {/* ── Admin modal ── */}
      {showAdmin && <Admin onClose={() => setShowAdmin(false)} />}

      {/* ── Footer ── */}
      <footer
        className="text-center py-5 text-xs"
        style={{ color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#120326" }}
      >
        FIFA World Cup 2026 Predictor · Predictions powered by ELO ratings + recent form · June 11 – July 19, 2026
        <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
        <button
          onClick={() => setShowRules(true)}
          className="underline underline-offset-2 transition-colors"
          style={{ color: "rgba(200,240,0,0.35)" }}
          onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(200,240,0,0.35)"}
        >
          Rules & Prize
        </button>
        <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
        <button
          onClick={() => setShowAdmin(true)}
          className="transition-colors"
          style={{ color: "rgba(255,255,255,0.1)" }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.1)"}
        >
          admin
        </button>
      </footer>
    </div>
  );
}
