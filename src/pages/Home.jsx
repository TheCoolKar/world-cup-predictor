import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { getLeagueLeaderboard } from "../utils/social";
import { buildResultsMap, calculateGroupScores, calculateStreaks } from "../utils/scoring";
import fixtures from "../data/wc2026_fixtures.json";
import HowItWorksModal from "../components/HowItWorksModal";


// ── League card ───────────────────────────────────────────────────────────────

function LeagueCard({ league, onNavigate }) {
  const rankColor = league.rank === 1 ? "#FFD700" : league.rank === 2 ? "#C0C0C0" : league.rank === 3 ? "#CD7F32" : "#c8f000";
  return (
    <button
      onClick={() => onNavigate("leagues", { leagueId: league.id, leagueName: league.name })}
      className="w-full text-left rounded-2xl p-5 transition-all duration-150"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,240,0,0.06)"; e.currentTarget.style.borderColor = "rgba(200,240,0,0.2)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-black text-white truncate" style={{ fontSize: "0.95rem" }}>{league.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
            {league.memberCount} member{league.memberCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black tabular-nums" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.6rem", color: rankColor, lineHeight: 1 }}>
            #{league.rank}
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>rank</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="font-black text-white tabular-nums" style={{ fontSize: "1.1rem", fontFamily: "'Bebas Neue',sans-serif" }}>
            {league.points ?? "—"}
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>pts</p>
        </div>
        <div className="text-center">
          <p className="font-black tabular-nums" style={{ fontSize: "1.1rem", fontFamily: "'Bebas Neue',sans-serif", color: "#22c55e" }}>
            {league.correct ?? "—"}
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>correct</p>
        </div>
        {league.champion && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(200,240,0,0.08)", border: "1px solid rgba(200,240,0,0.15)" }}>
            <span style={{ fontSize: "0.8rem" }}>🏆</span>
            <span className="text-xs font-bold" style={{ color: "#c8f000" }}>{league.champion}</span>
          </div>
        )}
      </div>
    </button>
  );
}

function MyLeagues({ userId, onNavigate }) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      const { data: memberships } = await supabase
        .from("league_members")
        .select("league_id")
        .eq("user_id", userId);

      if (!memberships?.length) { setLoading(false); return; }

      const leagueIds = memberships.map(m => m.league_id);
      const { data: leagueRows } = await supabase
        .from("leagues")
        .select("id, name")
        .in("id", leagueIds);

      const results = await Promise.all((leagueRows ?? []).map(async lg => {
        const board = await getLeagueLeaderboard(lg.id);
        const rank = board.findIndex(r => r.userId === userId) + 1;
        const me = board.find(r => r.userId === userId);
        return {
          id: lg.id,
          name: lg.name,
          memberCount: board.length,
          rank: rank || board.length,
          points: me?.points ?? null,
          correct: me?.correct ?? null,
          champion: me?.champion ?? null,
        };
      }));

      setLeagues(results);
      setLoading(false);
    }
    load();
  }, [userId]);

  if (loading) return (
    <div className="flex items-center gap-2 py-4" style={{ color: "rgba(255,255,255,0.6)" }}>
      <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      <span className="text-sm">Loading your leagues…</span>
    </div>
  );

  if (!leagues.length) return (
    <div className="text-center py-8 rounded-2xl" style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
      <p className="text-sm font-semibold mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>You haven't joined any leagues yet</p>
      <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Create one or join with a code to compete with friends</p>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {leagues.map(lg => <LeagueCard key={lg.id} league={lg} onNavigate={onNavigate} />)}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c8f000" }}>{label}</p>
      {action}
    </div>
  );
}

// ── Today's Matches + Countdown ───────────────────────────────────────────────

function parseFixtureDate(dateStr, timeStr) {
  const clean = timeStr.replace(" ET", "").trim();
  const [time, meridiem] = clean.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 4, m)); // EDT = UTC-4
}

function formatCountdown(ms) {
  if (ms <= 0) return "NOW";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function TodaysMatches({ liveMatches = {}, onNavigate }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const allWithDates = fixtures.map(f => ({ ...f, kickoff: parseFixtureDate(f.date, f.time) }));
  const todayET = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const todayMatches = allWithDates.filter(f => f.date === todayET).sort((a, b) => a.kickoff - b.kickoff);
  const futureMatches = allWithDates.filter(f => f.kickoff > now);
  const nextMatch = futureMatches.length > 0
    ? futureMatches.reduce((a, b) => a.kickoff < b.kickoff ? a : b)
    : null;

  if (!nextMatch && todayMatches.length === 0) return null;

  const msToNext = nextMatch ? nextMatch.kickoff - now : 0;

  function fmtTime(kickoff) {
    return kickoff.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c8f000" }}>
          {todayMatches.length > 0 ? "Today's Matches" : "Next Match"}
        </p>
        {nextMatch && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(200,240,0,0.08)", border: "1px solid rgba(200,240,0,0.15)" }}>
            <span style={{ fontSize: "0.7rem" }}>⏱</span>
            <span className="text-xs font-semibold" style={{ color: "rgba(200,240,0,0.7)" }}>Next match</span>
            <span className="text-xs font-black tabular-nums" style={{ color: "#c8f000" }}>
              {formatCountdown(msToNext)}
            </span>
          </div>
        )}
      </div>

      {todayMatches.length === 0 && nextMatch && (
        <div className="text-center py-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
            No matches today · Next up: <strong style={{ color: "rgba(255,255,255,0.85)" }}>{nextMatch.home} vs {nextMatch.away}</strong>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {todayMatches.map(f => {
          const live = liveMatches[f.id];
          const isLive = live
            ? live.status === "LIVE" || live.status === "HT"
            : now >= f.kickoff && now < new Date(f.kickoff.getTime() + 120 * 60 * 1000);
          const isFinished = live
            ? live.status !== "NS" && live.status !== "LIVE" && live.status !== "HT" && live.home_score != null
            : now >= new Date(f.kickoff.getTime() + 120 * 60 * 1000);
          const hasLiveScore = live?.home_score != null;

          return (
            <button key={f.id}
              onClick={() => onNavigate?.("schedule", { matchId: f.id })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-150"
              style={{
                background: isLive ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isLive ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = isLive ? "rgba(34,197,94,0.4)" : "rgba(200,240,0,0.2)"; e.currentTarget.style.background = isLive ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = isLive ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"; e.currentTarget.style.background = isLive ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.03)"; }}
            >
              <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.3)", minWidth: 36 }}>
                {f.group ? `Grp ${f.group}` : f.round ?? ""}
              </span>

              {/* Home */}
              <span className="flex-1 text-sm font-semibold text-right truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
                {f.home}
              </span>

              {/* Score / status */}
              <div className="shrink-0 text-center" style={{ minWidth: 72 }}>
                {isLive ? (
                  <div className="flex flex-col items-center gap-0.5">
                    {hasLiveScore && (
                      <span className="font-black tabular-nums text-sm" style={{ color: "#22c55e" }}>
                        {live.home_score} – {live.away_score}
                      </span>
                    )}
                    <span className="text-xs font-black px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      {live?.status === "HT" ? "HT" : live?.minute ? `${live.minute}'` : "LIVE"}
                    </span>
                  </div>
                ) : isFinished && hasLiveScore ? (
                  <div className="flex flex-col items-center">
                    <span className="font-black tabular-nums text-sm" style={{ color: "#c8f000" }}>
                      {live.home_score} – {live.away_score}
                    </span>
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>FT</span>
                  </div>
                ) : isFinished ? (
                  <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>FT</span>
                ) : (
                  <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>{fmtTime(f.kickoff)}</span>
                )}
              </div>

              {/* Away */}
              <span className="flex-1 text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
                {f.away}
              </span>

              {/* Chevron hint */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Personal stats card ───────────────────────────────────────────────────────

function MyStatsCard({ userId, onNavigate }) {
  const [stats, setStats] = useState(undefined); // undefined = loading, null = no submission

  useEffect(() => {
    async function load() {
      const [{ data: sub }, { data: resultsRows }, { data: allSubs }] = await Promise.all([
        supabase.from("submissions").select("picks, confidence, is_submitted").eq("user_id", userId).maybeSingle(),
        supabase.from("match_results").select("*"),
        supabase.from("submissions").select("user_id, picks, confidence"),
      ]);

      if (!sub?.is_submitted) { setStats(null); return; }

      const resultsMap = buildResultsMap(resultsRows ?? []);
      const { points, correct, incorrect } = calculateGroupScores(sub.picks ?? {}, resultsMap, sub.confidence ?? {});
      const { current: streak } = calculateStreaks(sub.picks ?? {}, resultsMap);

      // Compute global rank
      const scored = (allSubs ?? []).map(s => {
        const { points: p } = calculateGroupScores(s.picks ?? {}, resultsMap, s.confidence ?? {});
        return { userId: s.user_id, points: p ?? 0 };
      }).sort((a, b) => b.points - a.points);
      const rank = scored.findIndex(s => s.userId === userId) + 1;

      const totalGraded = (correct ?? 0) + (incorrect ?? 0);
      const accuracy = totalGraded > 0 ? Math.round((correct / totalGraded) * 100) : null;

      setStats({ points: points ?? 0, correct: correct ?? 0, incorrect: incorrect ?? 0, rank: rank || 1, accuracy, streak, totalPlayers: scored.length });
    }
    load().catch(() => setStats(null));
  }, [userId]);

  if (stats === undefined) return null;

  if (stats === null) return (
    <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#c8f000" }}>Your Picks</p>
      <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>You haven't submitted your bracket yet</p>
      <button onClick={() => onNavigate("mine")}
        className="px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
        style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", color: "white" }}>
        🏆 Make My Bracket →
      </button>
    </div>
  );

  return (
    <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c8f000" }}>Your Picks</p>
        <button onClick={() => onNavigate("leaderboard")}
          className="text-xs font-bold transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}
          onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}>
          Leaderboard →
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", color: "white", lineHeight: 1, letterSpacing: "0.04em" }}>
          #{stats.rank} <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.4)" }}>globally</span>
        </p>
        {stats.streak >= 2 && (
          <span className="text-xs font-black tabular-nums px-2 py-0.5 rounded-full"
            style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}
            title={`${stats.streak} correct predictions in a row`}>
            🔥 {stats.streak} game streak
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 text-center px-2 py-2 rounded-lg" style={{ background: "rgba(200,240,0,0.06)" }}>
          <p className="text-sm font-black tabular-nums" style={{ color: "#c8f000" }}>{stats.points}</p>
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase" }}>pts</p>
        </div>
        <div className="flex-1 text-center px-2 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.06)" }}>
          <p className="text-sm font-black tabular-nums" style={{ color: "#22c55e" }}>{stats.correct}</p>
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase" }}>correct</p>
        </div>
        <div className="flex-1 text-center px-2 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.06)" }}>
          <p className="text-sm font-black tabular-nums" style={{ color: "#ef4444" }}>{stats.incorrect}</p>
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase" }}>wrong</p>
        </div>
        <div className="flex-1 text-center px-2 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-sm font-black tabular-nums" style={{ color: "rgba(255,255,255,0.8)" }}>
            {stats.accuracy != null ? `${stats.accuracy}%` : "—"}
          </p>
          <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase" }}>acc.</p>
        </div>
      </div>
    </div>
  );
}

function HowItWorksTeaser({ onLearnMore }) {
  const steps = [
    { icon: "🗂️", label: "Pick Groups", desc: "72 matches" },
    { icon: "⚡", label: "Build Bracket", desc: "Auto-seeded" },
    { icon: "🏆", label: "Submit & Compete", desc: "Live rankings" },
  ];
  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c8f000" }}>How It Works</p>
        <button
          onClick={onLearnMore}
          className="text-xs font-bold transition-colors"
          style={{ color: "rgba(255,255,255,0.55)" }}
          onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.55)"}
        >Learn more →</button>
      </div>
      <div className="flex items-start gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex-1 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-2"
              style={{ background: "rgba(200,240,0,0.08)", border: "1px solid rgba(200,240,0,0.15)" }}>
              {s.icon}
            </div>
            <p className="text-xs font-black text-white leading-tight">{s.label}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{s.desc}</p>
            {i < steps.length - 1 && (
              <div className="absolute" style={{ display: "none" }} />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center mt-3 gap-1 justify-center">
        <div className="flex-1 h-px" style={{ background: "rgba(200,240,0,0.15)" }} />
        <span className="text-xs px-2" style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
        <div className="flex-1 h-px" style={{ background: "rgba(200,240,0,0.15)" }} />
      </div>
    </div>
  );
}

export default function Home({ onNavigate, onSignIn, onSignUp }) {
  const { user } = useAuth();
  const { liveMatches } = useLiveFeed();
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  return (
    <>
    {showHowItWorks && (
      <HowItWorksModal
        onClose={() => setShowHowItWorks(false)}
        onGetStarted={() => { setShowHowItWorks(false); onNavigate("mine"); }}
      />
    )}
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">

      {/* Today's matches + countdown — always visible, always first */}
      <TodaysMatches liveMatches={liveMatches} onNavigate={onNavigate} />

      {/* My Picks / Stats */}
      {user && (
        <section>
          <MyStatsCard userId={user.id} onNavigate={onNavigate} />
        </section>
      )}

      {/* My Leagues */}
      {user && (
        <section>
          <SectionHeader
            label="My Leagues"
            action={
              <button
                onClick={() => onNavigate("leagues")}
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                style={{ background: "rgba(200,240,0,0.1)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(200,240,0,0.18)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(200,240,0,0.1)"}
              >
                All Leagues →
              </button>
            }
          />
          <MyLeagues userId={user.id} onNavigate={onNavigate} />
          <button
            onClick={() => onNavigate("leagues")}
            className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
          >
            + Join or Create League
          </button>
        </section>
      )}

      {/* How It Works teaser — always visible */}
      <HowItWorksTeaser onLearnMore={() => setShowHowItWorks(true)} />

      {/* Sign-in prompt */}
      {!user && (
        <section className="text-center py-8 rounded-2xl" style={{ border: "1px dashed rgba(200,240,0,0.15)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Sign in to join a league and track your picks</p>
          <p className="text-xs mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>Compete with friends · Track your score · See live rankings</p>
          <div className="flex gap-2 justify-center">
            <button onClick={onSignIn}
              className="px-5 py-2 rounded-xl text-sm font-black transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
              Sign In
            </button>
            <button onClick={onSignUp}
              className="px-5 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Sign Up
            </button>
          </div>
        </section>
      )}


    </div>
    </>
  );
}
