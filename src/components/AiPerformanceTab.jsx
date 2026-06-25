import { useEffect, useMemo, useRef, useState } from "react";
import fixtures from "../data/wc2026_fixtures.json";
import predictionSnapshot from "../data/match_predictions_snapshot.json";
import { supabase } from "../lib/supabase";
import { buildAiPerformanceResultsMap, calculateAiPerformance } from "../utils/aiPerformance";

const GROUP_FIXTURES = fixtures.filter(fixture => fixture.group);
const REFRESH_INTERVAL_MS = 60_000;

function StatLine({ label, correct, total, rate, color }) {
  return (
    <div className="rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.72)" }}>{label}</span>
        <span className="text-xs font-black tabular-nums" style={{ color }}>{correct}/{total} · {rate}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none" style={{ width: `${rate}%`, background: color }} />
      </div>
    </div>
  );
}

export default function AiPerformanceTab({ onNavigate = null, label = "AI record", prominent = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [resultRows, setResultRows] = useState([]);
  const [liveRows, setLiveRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    let active = true;
    let intervalId = null;

    const applyRealtimeRow = setter => payload => {
      if (!active) return;
      const matchId = payload.new?.match_id ?? payload.old?.match_id;
      if (!matchId) return;

      setter(rows => {
        const nextRows = rows.filter(row => row.match_id !== matchId);
        return payload.eventType === "DELETE" ? nextRows : [...nextRows, payload.new];
      });
      setError(null);
    };

    async function refreshScores({ showLoading = false } = {}) {
      if (showLoading) setLoading(true);

      try {
        const [resultsResponse, liveResponse] = await Promise.all([
          supabase.from("match_results").select("match_id, home_score, away_score, result, source, updated_at"),
          supabase.from("live_matches").select("match_id, status, minute, home_score, away_score, updated_at"),
        ]);
        if (!active) return;

        if (resultsResponse.error) {
          setError(resultsResponse.error.message ?? "Could not load results");
        } else {
          setResultRows(resultsResponse.data ?? []);
          setError(null);
        }

        if (!liveResponse.error) setLiveRows(liveResponse.data ?? []);
        setLoading(false);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message ?? "Could not load results");
        setLoading(false);
      }
    }

    refreshScores({ showLoading: true });

    const channel = supabase
      .channel("ai-performance-score-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results" }, applyRealtimeRow(setResultRows))
      .on("postgres_changes", { event: "*", schema: "public", table: "live_matches" }, applyRealtimeRow(setLiveRows))
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") refreshScores();
      });

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refreshScores();
    };

    intervalId = window.setInterval(() => refreshScores(), REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshScores);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      active = false;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshScores);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePress = event => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const resultsMap = useMemo(
    () => buildAiPerformanceResultsMap(resultRows, liveRows),
    [resultRows, liveRows],
  );

  const stats = useMemo(
    () => calculateAiPerformance(GROUP_FIXTURES, predictionSnapshot, resultsMap),
    [resultsMap],
  );
  const finalGraded = Math.max(stats.played - stats.provisional, 0);

  const tabValue = loading ? "…" : stats.played > 0 ? `${stats.successRate}%` : "—";
  const isNavigationButton = typeof onNavigate === "function";

  return (
    <div ref={rootRef} className={`relative w-full ${prominent ? "md:w-auto" : "sm:w-auto"} shrink-0`}>
      <button
        type="button"
        aria-expanded={isNavigationButton ? undefined : isOpen}
        aria-controls={isNavigationButton ? undefined : "ai-performance-panel"}
        onClick={isNavigationButton ? onNavigate : () => setIsOpen(open => !open)}
        className={`${prominent ? "w-full min-h-[72px] gap-3 rounded-2xl px-4 py-3" : "ml-auto min-h-11 gap-2.5 rounded-xl px-3 py-2"} flex items-center text-left transition-all duration-150 active:scale-[0.98]`}
        style={{
          background: prominent
            ? "linear-gradient(135deg,rgba(29,78,216,0.96),rgba(76,29,149,0.96))"
            : isOpen ? "rgba(200,240,0,0.12)" : "rgba(255,255,255,0.05)",
          border: prominent
            ? "1px solid rgba(165,180,252,0.42)"
            : `1px solid ${isOpen ? "rgba(200,240,0,0.32)" : "rgba(255,255,255,0.09)"}`,
          boxShadow: prominent ? "0 0 32px rgba(79,70,229,0.38),0 4px 16px rgba(0,0,0,0.35)" : isOpen ? "0 0 24px rgba(200,240,0,0.08)" : "none",
        }}
      >
        <span className={`${prominent ? "w-11 h-11 rounded-xl" : "w-8 h-8 rounded-lg"} flex items-center justify-center shrink-0`} style={{ background: prominent ? "rgba(255,255,255,0.13)" : "rgba(200,240,0,0.12)", fontSize: prominent ? "1.3rem" : "0.95rem" }}>🤖</span>
        <span>
          <span className="block font-black uppercase tracking-wider" style={{ color: prominent ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.78)", fontSize: prominent ? "0.62rem" : "0.58rem", lineHeight: 1 }}>{label}</span>
          <span className="block font-black tabular-nums mt-1" style={{ color: error ? "#fca5a5" : prominent ? "white" : "#c8f000", fontSize: prominent ? "1.35rem" : "0.86rem", lineHeight: 1 }}>{error ? "Unavailable" : tabValue}</span>
          {prominent && <span className="block mt-1 font-semibold" style={{ color: "rgba(255,255,255,0.58)", fontSize: "0.58rem", lineHeight: 1 }}>View AI predictions</span>}
        </span>
        <svg aria-hidden="true" className="w-3.5 h-3.5 ml-1 transition-transform duration-150" style={{ color: "rgba(255,255,255,0.45)", transform: !isNavigationButton && isOpen ? "rotate(180deg)" : "rotate(0deg)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isNavigationButton ? "M9 5l7 7-7 7" : "M19 9l-7 7-7-7"} />
        </svg>
      </button>

      {!isNavigationButton && isOpen && (
        <div
          id="ai-performance-panel"
          role="region"
          aria-label="Our AI prediction performance"
          className="absolute right-0 top-full z-30 mt-2 rounded-2xl overflow-hidden"
          style={{
            width: "min(360px, calc(100vw - 2rem))",
            background: "linear-gradient(160deg,#210743 0%,#140329 100%)",
            border: "1px solid rgba(200,240,0,0.2)",
            boxShadow: "0 22px 60px rgba(0,0,0,0.55)",
          }}
        >
          <div className="px-4 py-3.5 flex items-center justify-between gap-3" style={{ background: "rgba(200,240,0,0.05)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <p className="font-black" style={{ fontFamily: "'Bebas Neue',sans-serif", color: "white", fontSize: "1.25rem", letterSpacing: "0.05em", lineHeight: 1 }}>Our AI So Far</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                {stats.provisional > 0
                  ? `${finalGraded} final + ${stats.provisional} live prediction${stats.played === 1 ? "" : "s"} graded`
                  : `${stats.played} group prediction${stats.played === 1 ? "" : "s"} graded`}
              </p>
            </div>
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.18)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="font-bold uppercase tracking-wider" style={{ color: "#4ade80", fontSize: "0.5rem" }}>
                {stats.provisional > 0 ? "Live score" : "Live stats"}
              </span>
            </span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Checking the scorecards…</div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-bold text-white">Stats temporarily unavailable</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>The predictions are still here; the results feed could not be loaded.</p>
            </div>
          ) : stats.played === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-2xl mb-2">⏳</p>
              <p className="text-sm font-bold text-white">Waiting for score updates</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>This record updates as group matches go live and final scores land.</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-20 h-20 rounded-full p-1 shrink-0"
                  style={{ background: `conic-gradient(#c8f000 ${stats.successRate}%, rgba(255,255,255,0.08) 0)` }}
                >
                  <div className="w-full h-full rounded-full flex flex-col items-center justify-center" style={{ background: "#190533" }}>
                    <span className="font-black tabular-nums" style={{ color: "#c8f000", fontSize: "1.15rem", lineHeight: 1 }}>{stats.successRate}%</span>
                    <span className="uppercase font-bold mt-1" style={{ color: "rgba(255,255,255,0.38)", fontSize: "0.45rem", letterSpacing: "0.08em" }}>Hit rate</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-white">{stats.hits} of {stats.played} matches hit</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                    A match counts when the AI gets either the outcome or the exact scoreline right.
                    {stats.provisional > 0 ? " Live matches are provisional until full time." : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <StatLine label="Correct outcomes" correct={stats.outcomeCorrect} total={stats.played} rate={stats.outcomeRate} color="#4ade80" />
                <StatLine label="Exact scorelines" correct={stats.exactScoreCorrect} total={stats.played} rate={stats.exactScoreRate} color="#f59e0b" />
              </div>

              <p className="text-xs mt-3 text-center" style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.62rem" }}>
                Draws count when draw was the model&apos;s most likely outcome. Only frozen pre-match predictions are graded.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
