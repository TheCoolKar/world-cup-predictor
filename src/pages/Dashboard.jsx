/**
 * Dashboard.jsx — user's prediction overview
 * Shows group pick progress, bracket advancement picks, champion selection.
 */

import { getPicks, getBracket } from "../utils/storage";
import { useAuth }              from "../hooks/useAuth";
import fixtures                 from "../data/wc2026_fixtures.json";
import modelWeights             from "../data/model_weights.json";
import polymarketOdds           from "../data/polymarket_odds.json";

// ── helpers ───────────────────────────────────────────────────────────────────

const ROUND_LABELS = {
  R32: { label: "Round of 32",  slots: 32 },
  R16: { label: "Round of 16",  slots: 16 },
  QF:  { label: "Quarter-finals", slots: 8 },
  SF:  { label: "Semi-finals",  slots: 4 },
  F:   { label: "Final",        slots: 2 },
};

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

function groupFixtures(group) {
  return fixtures.filter(f => f.group === group);
}

function percent(val, total) {
  if (!total) return 0;
  return Math.round((val / total) * 100);
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = "#c8f000" }) {
  return (
    <div
      className="flex flex-col rounded-2xl px-5 py-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <span
        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", color: accent, lineHeight: 1 }}
      >
        {value}
      </span>
      <span className="text-xs font-bold mt-1 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
        {label}
      </span>
      {sub && (
        <span className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function ProgressBar({ value, max, accent = "#c8f000" }) {
  const pct = percent(value, max);
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: "rgba(255,255,255,0.07)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
      />
    </div>
  );
}

function TeamChip({ name, accent = "#c8f000" }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold"
      style={{ background: `rgba(${accent === "#c8f000" ? "200,240,0" : "239,68,68"},0.12)`, color: accent, border: `1px solid ${accent}28` }}
    >
      {name}
    </span>
  );
}

function SectionHeader({ title, badge }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="font-black text-white" style={{ fontSize: "1rem" }}>{title}</h3>
      {badge && (
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Model status component ────────────────────────────────────────────────────

function StatusRow({ icon, label, value, accent = "#c8f000", sub }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ fontSize: "1rem", lineHeight: 1, marginTop: 1 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>{sub}</p>}
      </div>
      <span className="text-xs font-black shrink-0" style={{ color: accent }}>{value}</span>
    </div>
  );
}

function ModelStatus() {
  const isTrained    = modelWeights._trained === true;
  const cvAccuracy   = modelWeights._cv_accuracy;
  const trainSamples = modelWeights._samples;

  const oddsMatched  = polymarketOdds._matched ?? 0;
  const oddsTotal    = polymarketOdds._total_fixtures ?? 72;
  const oddsFetched  = polymarketOdds._fetched;
  const fetchedDate  = oddsFetched
    ? new Date(oddsFetched).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section
      className="rounded-2xl p-6"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-white" style={{ fontSize: "1rem" }}>Prediction Engine</h3>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: isTrained ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
            color:      isTrained ? "#22c55e" : "#f59e0b",
            border:     `1px solid ${isTrained ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
          }}
        >
          {isTrained ? "✓ Live" : "⚠ Seed weights"}
        </span>
      </div>

      <StatusRow
        icon="🧠"
        label="Prediction model"
        sub={isTrained
          ? `Trained on ${trainSamples?.toLocaleString()} historical matches`
          : "Using domain-knowledge seed weights — run train_model.py to improve"}
        value={isTrained ? `${(cvAccuracy * 100).toFixed(1)}% accuracy` : "Seed"}
        accent={isTrained ? "#22c55e" : "#f59e0b"}
      />

      <StatusRow
        icon="📈"
        label="Polymarket live odds"
        sub={fetchedDate ? `Last refreshed ${fetchedDate}` : "Not yet fetched — run: npm run fetch-odds"}
        value={`${oddsMatched}/${oddsTotal} fixtures`}
        accent={oddsMatched === oddsTotal ? "#22c55e" : oddsMatched > 0 ? "#c8f000" : "#ef4444"}
      />

      <StatusRow
        icon="⚖️"
        label="Blend weights"
        sub="When Polymarket data is available for a fixture"
        value="55% market · 45% model"
        accent="rgba(255,255,255,0.5)"
      />

      <div className="mt-4 pt-1 flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.2)" }}>
          Refresh commands
        </p>
        {[
          { cmd: "npm run fetch-odds",   desc: "Pull latest Polymarket prices" },
          { cmd: "npm run train-model",  desc: "Re-train model on Kaggle data" },
        ].map(({ cmd, desc }) => (
          <div key={cmd} className="flex items-center gap-2">
            <code
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.07)", color: "#c8f000", fontFamily: "monospace" }}
            >
              {cmd}
            </code>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>{desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <span style={{ fontSize: "3rem" }}>📊</span>
        <h2
          className="text-white mt-4 mb-2"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.06em" }}
        >
          Sign In to View Your Dashboard
        </h2>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
          Your picks are saved locally. Sign in to track your predictions and compete on the leaderboard.
        </p>
      </div>
    );
  }

  const picks   = getPicks();
  const bracket = getBracket();

  // ── group stage stats ──────────────────────────────────────────────────────
  const totalGroupMatches = fixtures.filter(f => f.group).length; // 72
  const pickedGroupCount  = Object.keys(picks).length;

  const groupProgress = GROUPS.map(g => {
    const gFixtures = groupFixtures(g);
    const picked    = gFixtures.filter(f => picks[f.id]).length;
    return { group: g, picked, total: gFixtures.length };
  });

  // ── bracket stats ──────────────────────────────────────────────────────────
  const bracketRounds = bracket
    ? ["R32","R16","QF","SF","F"].reduce((s, r) => s + (bracket[r]?.filter(Boolean).length ?? 0), 0)
      + (bracket["3P"]?.[0] ? 1 : 0)
    : 0;
  const bracketTotal = 32; // 32+16+8+4+2+1 - 1(3P already counted) = 63, but per Profile it's /32
  const champion    = bracket?.F?.[0] ?? null;
  const thirdPlace  = bracket?.["3P"]?.[0] ?? null;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Overview</p>
        <h2
          className="text-white"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.06em" }}
        >
          My Dashboard
        </h2>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Group Picks"
          value={pickedGroupCount}
          sub={`of ${totalGroupMatches} matches`}
          accent="#c8f000"
        />
        <StatCard
          label="Bracket Picks"
          value={bracketRounds}
          sub="of 32+ rounds"
          accent="#c8f000"
        />
        <StatCard
          label="Champion"
          value={champion ? "✓" : "—"}
          sub={champion ?? "Not chosen"}
          accent={champion ? "#22c55e" : "rgba(255,255,255,0.2)"}
        />
      </div>

      {/* ── Champion showcase ── */}
      {champion && (
        <section
          className="rounded-2xl p-6 mb-4 flex items-center gap-4"
          style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.04))", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}
          >
            🏆
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "#22c55e" }}>Your Champion Pick</p>
            <p className="text-white font-black text-xl" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}>
              {champion}
            </p>
            {thirdPlace && (
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                🥉 3rd place pick: <span style={{ color: "rgba(255,255,255,0.55)" }}>{thirdPlace}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Bracket advancement ── */}
      <section
        className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <SectionHeader title="Bracket Picks" badge={`${bracketRounds} picked`} />

        {!bracket || bracketRounds === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No bracket picks yet.</p>
            {onNavigate && (
              <button
                onClick={() => onNavigate("mine")}
                className="mt-3 text-xs font-bold px-4 py-2 rounded-xl transition-all"
                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
              >
                Go to My Bracket →
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(ROUND_LABELS).map(([round, { label, slots }]) => {
              const picks_in_round = (bracket[round] ?? []).filter(Boolean);
              if (picks_in_round.length === 0) return null;
              return (
                <div key={round}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {label}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.25)" }}>
                      {picks_in_round.length}/{slots}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {picks_in_round.map((team, i) => (
                      <TeamChip
                        key={`${round}-${i}`}
                        name={team}
                        accent={round === "F" ? "#22c55e" : "#c8f000"}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {bracket?.["3P"]?.[0] && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                    3rd Place
                  </span>
                </div>
                <TeamChip name={bracket["3P"][0]} accent="#f59e0b" />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Group stage progress ── */}
      <section
        className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <SectionHeader
          title="Group Stage Picks"
          badge={`${pickedGroupCount}/${totalGroupMatches}`}
        />

        {pickedGroupCount === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No group stage picks yet.</p>
            {onNavigate && (
              <button
                onClick={() => onNavigate("groups")}
                className="mt-3 text-xs font-bold px-4 py-2 rounded-xl transition-all"
                style={{ background: "rgba(200,240,0,0.1)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,240,0,0.18)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(200,240,0,0.1)"; }}
              >
                Go to Group Stage →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {groupProgress.map(({ group, picked, total }) => {
              const done = picked === total;
              return (
                <div
                  key={group}
                  className="rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${done ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-black"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1rem", color: done ? "#22c55e" : "#c8f000" }}
                    >
                      Group {group}
                    </span>
                    <span className="text-xs font-bold" style={{ color: done ? "#22c55e" : "rgba(255,255,255,0.3)" }}>
                      {done ? "✓" : `${picked}/${total}`}
                    </span>
                  </div>
                  <ProgressBar value={picked} max={total} accent={done ? "#22c55e" : "#c8f000"} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Overall progress ── */}
      <section
        className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <SectionHeader title="Overall Completion" />
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>Group Stage</span>
              <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>
                {percent(pickedGroupCount, totalGroupMatches)}%
              </span>
            </div>
            <ProgressBar value={pickedGroupCount} max={totalGroupMatches} accent="#c8f000" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>Bracket</span>
              <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>
                {percent(bracketRounds, 32)}%
              </span>
            </div>
            <ProgressBar value={bracketRounds} max={32} accent="#ef4444" />
          </div>
        </div>
      </section>

      {/* ── Model status ── */}
      <ModelStatus />

    </div>
  );
}
