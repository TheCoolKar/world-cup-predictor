import { useState }  from "react";
import GroupStage   from "./pages/GroupStage";
import Bracket      from "./pages/Bracket";
import MyBracket    from "./pages/MyBracket";
import banner from "./assets/worldcupbanner.webp";
import trophy from "./assets/worldcuppng.webp";
import "./index.css";

const HOST_NATIONS = [
  { name: "USA",    flag: "🇺🇸" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "Mexico", flag: "🇲🇽" },
];

const TABS = [
  { id: "groups",    label: "Group Stage"   },
  { id: "bracket",   label: "AI Bracket"    },
  { id: "mybracket", label: "My Bracket"    },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("groups");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#1a0533" }}>

      {/* ── Hero banner ── */}
      <header className="relative overflow-hidden" style={{ minHeight: 340 }}>

        <img
          src={banner}
          alt="FIFA World Cup 2026"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(15,4,40,0.82) 0%, rgba(15,4,40,0.55) 50%, rgba(15,4,40,0.1) 100%)" }}
        />

        <div className="relative max-w-4xl mx-auto px-6 py-12 flex items-center gap-8 h-full" style={{ minHeight: 340 }}>

          <div className="shrink-0 hidden sm:block">
            <img
              src={trophy}
              alt="FIFA World Cup Trophy"
              className="w-36 h-36 object-contain"
              style={{ mixBlendMode: "luminosity", filter: "drop-shadow(0 0 24px rgba(200,240,0,0.25))" }}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-2" style={{ color: "#c8f000" }}>
                Match Predictor
              </p>
              <h1
                className="text-white leading-none"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(3rem, 9vw, 5.5rem)", letterSpacing: "0.04em", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
              >
                FIFA World Cup
              </h1>
              <h1
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(3rem, 9vw, 5.5rem)", letterSpacing: "0.04em", lineHeight: 1, background: "linear-gradient(90deg, #c8f000, #a3e635)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                2026
              </h1>
            </div>

            <p className="text-sm max-w-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              ELO-powered win probabilities for all{" "}
              <span className="font-semibold text-white">104 matches</span> across{" "}
              <span className="font-semibold text-white">12 groups</span> — blended with real team form data.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                Hosted by
              </span>
              {HOST_NATIONS.map((n) => (
                <div
                  key={n.name}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <span className="text-sm leading-none">{n.flag}</span>
                  <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{n.name}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-6 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              {[
                { value: "48",  label: "Teams"   },
                { value: "12",  label: "Groups"  },
                { value: "104", label: "Matches" },
              ].map((s) => (
                <div key={s.label}>
                  <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", lineHeight: 1, color: "#c8f000" }}>
                    {s.value}
                  </p>
                  <p className="text-xs uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-12" style={{ background: "linear-gradient(to bottom, transparent, #1a0533)" }} />
      </header>

      {/* ── Tab bar ── */}
      <div
        className="sticky top-0 z-40 flex justify-center px-4 py-3"
        style={{ background: "rgba(26,5,51,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
              style={{
                background: activeTab === tab.id
                  ? "linear-gradient(135deg, #c8f000, #84cc16)"
                  : "transparent",
                color: activeTab === tab.id ? "#1a0533" : "rgba(255,255,255,0.5)",
                letterSpacing: "0.02em",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1" style={{ background: "#1a0533" }}>
        {activeTab === "groups"    && <GroupStage />}
        {activeTab === "bracket"   && <Bracket />}
        {activeTab === "mybracket" && <MyBracket />}
      </main>

      {/* ── Footer ── */}
      <footer
        className="text-center py-5 text-xs"
        style={{ color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#120326" }}
      >
        FIFA World Cup 2026 Predictor · Predictions powered by ELO ratings + recent form · June 11 – July 19, 2026
      </footer>
    </div>
  );
}
