import { normalizeConfidence } from "../utils/scoring";

const LEVELS = {
  1: { color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" },
  2: { color: "#f59e0b", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.4)" },
  3: { color: "#c8f000", bg: "rgba(200,240,0,0.14)", border: "rgba(200,240,0,0.45)" },
};

/**
 * Tap-to-cycle confidence chip: ×1 → ×2 → ×3 → ×1.
 * A correct pick earns 1 point × confidence; a wrong pick scores 0 either way.
 */
export default function ConfidencePicker({ value, onChange, disabled = false }) {
  const conf = normalizeConfidence(value);
  const s = LEVELS[conf];

  if (disabled) {
    if (conf === 1) return null; // nothing to show for the default
    return (
      <span
        className="shrink-0 rounded font-black tabular-nums px-1 text-center"
        style={{ fontSize: "0.6rem", lineHeight: "16px", minWidth: 22, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
        title={`Confidence ×${conf} — pays ${conf} points if correct`}
      >
        ×{conf}
      </span>
    );
  }

  return (
    <button
      onClick={() => onChange(conf === 3 ? 1 : conf + 1)}
      className="shrink-0 rounded font-black tabular-nums px-1 text-center transition-all duration-100 active:scale-90"
      style={{ fontSize: "0.6rem", lineHeight: "16px", minWidth: 22, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
      title={`Confidence ×${conf} — tap to boost. A correct pick earns ${conf} point${conf > 1 ? "s" : ""}, a wrong one still scores 0.`}
    >
      ×{conf}
    </button>
  );
}
