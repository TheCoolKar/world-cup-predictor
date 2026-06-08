import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { getLeagueLeaderboard } from "../utils/social";
import fixtures from "../data/wc2026_fixtures.json";

const fixtureMap = Object.fromEntries(fixtures.map(f => [f.id, f]));

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

// ── Live scores ───────────────────────────────────────────────────────────────

function LiveScores() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("match_results")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(8)
      .then(({ data }) => { setResults(data ?? []); setLoading(false); });
  }, []);

  if (loading) return null;

  if (!results.length) return (
    <div className="text-center py-6 rounded-2xl" style={{ border: "1px dashed rgba(255,255,255,0.08)" }}>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Tournament kicks off June 11 · Scores will appear here</p>
    </div>
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {results.map(r => {
        const fix = fixtureMap[r.match_id];
        if (!fix) return null;
        return (
          <div key={r.match_id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-xs font-bold w-5 shrink-0" style={{ color: "rgba(255,255,255,0.55)" }}>{r.match_id}</span>
            <span className="flex-1 text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
              {fix.home} <span style={{ color: "rgba(255,255,255,0.6)" }}>vs</span> {fix.away}
            </span>
            <span className="font-black tabular-nums text-sm" style={{ color: "#c8f000" }}>
              {r.home_score}–{r.away_score}
            </span>
          </div>
        );
      })}
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Home({ onNavigate, onSignIn, onSignUp }) {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">

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

      {/* Live Scores */}
      <section>
        <SectionHeader label="Match Results" />
        <LiveScores />
      </section>

    </div>
  );
}
