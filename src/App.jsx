import { useState } from "react";
import GroupStage from "./pages/GroupStage";
import Predict from "./pages/Predict";
import Bracket from "./pages/Bracket";
import banner from "./assets/worldcupbanner.webp";
import trophy from "./assets/worldcuppng.webp";
import "./index.css";

const HOST_NATIONS = [
  { name: "USA",    flag: "🇺🇸" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "Mexico", flag: "🇲🇽" },
];

const TABS = [
  { id: "predictions", label: "ELO Predictions"  },
  { id: "picks",       label: "Group Stage Picks" },
  { id: "bracket",     label: "Knockout Bracket"  },
];

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export default function App() {
  const [activeTab,       setActiveTab]       = useState("predictions");
  const [submittedGroups, setSubmittedGroups] = useState({});

  const bracketUnlocked = GROUPS.every((g) => submittedGroups[g]);

  function handleNavigate(tab) {
    if (tab === "bracket" && !bracketUnlocked) return;
    setActiveTab(tab);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#1a0533" }}>

      {/* ── Hero banner ── */}
      <header className="relative overflow-hidden" style={{ minHeight: 340 }}>

        {/* Banner image */}
        <img
          src={banner}
          alt="FIFA World Cup 2026"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Dark overlay so left-side text is readable */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(15,4,40,0.82) 0%, rgba(15,4,40,0.55) 50%, rgba(15,4,40,0.1) 100%)" }}
        />

        {/* Content */}
        <div className="relative max-w-4xl mx-auto px-6 py-12 flex items-center gap-8 h-full" style={{ minHeight: 340 }}>

          {/* Trophy logo */}
          <div className="shrink-0 hidden sm:block">
            <img
              src={trophy}
              alt="FIFA World Cup Trophy"
              className="w-36 h-36 object-contain"
              style={{ mixBlendMode: "luminosity", filter: "drop-shadow(0 0 24px rgba(200,240,0,0.25))" }}
            />
          </div>

          {/* Text block */}
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

            {/* Host nations */}
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

            {/* Stats row */}
            <div className="flex gap-6 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              {[
                { value: "48",  label: "Teams" },
                { value: "12",  label: "Groups" },
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

        {/* Bottom fade into page bg */}
        <div className="absolute bottom-0 left-0 right-0 h-12" style={{ background: "linear-gradient(to bottom, transparent, #1a0533)" }} />
      </header>

      {/* ── Tab bar ── */}
      <div
        className="sticky top-0 z-10"
        style={{ background: "rgba(26,5,51,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="max-w-4xl mx-auto px-4 flex gap-1 py-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const isLocked = tab.id === "bracket" && !bracketUnlocked;
            return (
              // Wrapper div holds the native tooltip — disabled buttons swallow pointer events
              <div key={tab.id} className="relative group" style={{ display: "inline-block" }}>
                <button
                  onClick={() => handleNavigate(tab.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150"
                  style={
                    isActive
                      ? { background: "#c8f000", color: "#0a0014", cursor: "pointer" }
                      : isLocked
                      ? { background: "transparent", color: "rgba(255,255,255,0.25)", cursor: "not-allowed" }
                      : { background: "transparent", color: "rgba(255,255,255,0.45)", cursor: "pointer" }
                  }
                >
                  {tab.label}
                  {isLocked && (
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </button>

                {/* Custom tooltip shown on hover when locked */}
                {isLocked && (
                  <div
                    className="absolute left-1/2 top-full mt-2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    style={{ transform: "translateX(-50%)", whiteSpace: "nowrap" }}
                  >
                    <div
                      className="text-xs font-semibold px-3 py-2 rounded-lg"
                      style={{ background: "#1a0533", border: "1px solid rgba(200,240,0,0.3)", color: "rgba(255,255,255,0.75)" }}
                    >
                      Submit all 12 groups first
                    </div>
                    <div
                      className="mx-auto mt-0"
                      style={{
                        width: 0, height: 0,
                        borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent",
                        borderBottom: "5px solid rgba(200,240,0,0.3)",
                        position: "absolute", top: -5, left: "50%", transform: "translateX(-50%) rotate(180deg)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1" style={{ background: "#1a0533" }}>
        {activeTab === "predictions" && <GroupStage />}
        {activeTab === "picks"       && (
          <Predict
            submittedGroups={submittedGroups}
            setSubmittedGroups={setSubmittedGroups}
            onNavigate={handleNavigate}
          />
        )}
        {activeTab === "bracket" && bracketUnlocked && <Bracket />}
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
