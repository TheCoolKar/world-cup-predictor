import { useMemo } from "react";
import { simulateMatchMonteCarlo } from "../utils/TournamentSimulator";
import { normalizeConfidence } from "../utils/scoring";

const OUTCOME_LABELS = { home: "Home win", draw: "Draw", away: "Away win" };

function ProbBar({ label, pct, isActual, isModelPick, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold shrink-0" style={{ width: 64, color: isActual ? "white" : "rgba(255,255,255,0.5)" }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color, opacity: isActual ? 1 : 0.45 }} />
      </div>
      <span className="text-xs font-black tabular-nums shrink-0 text-right" style={{ width: 38, color: isActual ? color : "rgba(255,255,255,0.4)" }}>
        {pct}%
      </span>
      <span className="shrink-0 text-center" style={{ width: 14, fontSize: "0.6rem" }}>
        {isActual ? "✓" : isModelPick ? "·" : ""}
      </span>
    </div>
  );
}

/**
 * Shown after a match result is in: what the model predicted, what actually
 * happened, and whether the user's pick (if any) paid off.
 */
export default function PostMatchBreakdown({ match, result, userPick = null, confidence = 1 }) {
  const { home, away } = match;
  const mc = useMemo(() => simulateMatchMonteCarlo(home, away, match.id), [home, away, match.id]);

  const actual = result.result
    ?? (Number(result.home_score) > Number(result.away_score) ? "home"
      : Number(result.home_score) < Number(result.away_score) ? "away" : "draw");

  const probs = { home: mc.homeWin, draw: mc.draw, away: mc.awayWin };
  const modelPick = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
  const modelRight = modelPick === actual;
  const conf = normalizeConfidence(confidence);
  const userRight = userPick != null && userPick === actual;
  const pointsEarned = userRight ? conf : 0;

  const modelPickName = modelPick === "home" ? home : modelPick === "away" ? away : null;
  const actualName = actual === "home" ? home : actual === "away" ? away : null;

  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

      {/* Model probabilities vs what happened */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
          Model pre-match odds <span className="normal-case font-semibold tracking-normal" style={{ color: "rgba(255,255,255,0.25)" }}>· ✓ = what happened</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <ProbBar label={home} pct={probs.home} isActual={actual === "home"} isModelPick={modelPick === "home"} color="#c8f000" />
          <ProbBar label="Draw" pct={probs.draw} isActual={actual === "draw"} isModelPick={modelPick === "draw"} color="#f59e0b" />
          <ProbBar label={away} pct={probs.away} isActual={actual === "away"} isModelPick={modelPick === "away"} color="#ef4444" />
        </div>
      </div>

      {/* Verdict lines */}
      <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: modelRight ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color: modelRight ? "#22c55e" : "#ef4444",
            }}>
            {modelRight ? "Model called it" : "Upset!"}
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
            {modelPickName ? (
              <>Had {modelPickName} at <strong style={{ color: "rgba(255,255,255,0.85)" }}>{probs[modelPick]}%</strong></>
            ) : (
              <>Leaned draw at <strong style={{ color: "rgba(255,255,255,0.85)" }}>{probs.draw}%</strong></>
            )}
            {" · "}likeliest score {mc.score.home}–{mc.score.away}
            {" · "}actually {actualName ? <>{actualName} won</> : <>a draw</>} {result.home_score}–{result.away_score}
          </span>
        </div>

        {userPick != null ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{
                background: userRight ? "rgba(200,240,0,0.12)" : "rgba(239,68,68,0.1)",
                color: userRight ? "#c8f000" : "#ef4444",
              }}>
              {userRight ? `You got it · +${pointsEarned} pt${pointsEarned > 1 ? "s" : ""}` : "You missed this one"}
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              You picked {OUTCOME_LABELS[userPick]?.toLowerCase() ?? userPick}
              {conf > 1 && <> at <strong style={{ color: userRight ? "#c8f000" : "rgba(255,255,255,0.7)" }}>×{conf} confidence</strong></>}
            </span>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            You didn't make a pick for this match.
          </p>
        )}
      </div>
    </div>
  );
}
