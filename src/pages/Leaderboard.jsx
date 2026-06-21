import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useModalA11y } from "../hooks/useModalA11y";
import { getLeagueLeaderboard, getMatchResults } from "../utils/social";
import { calculateGroupScores, calculateStreaks, selectHottestStreaks } from "../utils/scoring";
import BracketPicksSummary from "../components/BracketPicksSummary";


function Avatar({ url, username, size = 32 }) {
  if (url) return <img src={url} alt={username} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, background: "rgba(200,240,0,0.15)", color: "#c8f000", fontSize: size * 0.4 }}>
      {username?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function RankBadge({ rank }) {
  const colors = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
  const color = colors[rank] ?? "rgba(255,255,255,0.25)";
  return (
    <span className="font-black tabular-nums" style={{ color, fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", minWidth: 28, display: "inline-block", textAlign: "center" }}>
      {rank}
    </span>
  );
}

// League leaderboard row — shows bracket inline
function LeagueRow({ row, rank, isMe, onViewProfile }) {
  return (
    <div
      onClick={() => onViewProfile?.(row.userId, row.username, row.avatarUrl)}
      style={{
        borderTop: "1px solid rgba(255,255,255,0.05)",
        background: isMe ? "rgba(200,240,0,0.04)" : "transparent",
        padding: "14px 20px",
        cursor: onViewProfile ? "pointer" : "default",
      }}
      onMouseEnter={e => { if (onViewProfile) e.currentTarget.style.background = isMe ? "rgba(200,240,0,0.07)" : "rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = isMe ? "rgba(200,240,0,0.04)" : "transparent"; }}
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={rank} />
        <Avatar url={row.avatarUrl} username={row.username} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: isMe ? "#c8f000" : "rgba(255,255,255,0.9)" }}>
              {row.username}{isMe && <span className="ml-1 text-xs" style={{ color: "rgba(200,240,0,0.6)" }}>(you)</span>}
            </span>
            <span className="text-xs font-black tabular-nums px-2 py-0.5 rounded-full"
              style={{ background: "rgba(200,240,0,0.08)", color: "#c8f000" }}>
              {row.hasBracket ? `${row.pickCount} picks` : "No bracket entered"}
            </span>
            {row.streak >= 2 && (
              <span className="text-xs font-black tabular-nums px-2 py-0.5 rounded-full"
                style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)" }}
                title={`${row.streak} correct predictions in a row`}>
                🔥 {row.streak} streak
              </span>
            )}
            {row.updatedAt && row.hasBracket && (
              <span className="text-xs hidden sm:inline" style={{ color: "rgba(255,255,255,0.55)" }}>
                · {new Date(row.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {row.hasBracket
            ? <BracketPicksSummary champion={row.champion} finalist={row.finalist} third={row.third} semis={row.semis ?? []} />
            : <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>Hasn't entered a bracket yet</p>
          }
        </div>

        {/* Stat chips */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-center px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(200,240,0,0.08)", minWidth: 52 }}>
            <p className="text-xs font-black tabular-nums" style={{ color: "#c8f000" }}>{row.points ?? "—"}</p>
            <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.6rem" }}>PTS</p>
          </div>
          <div className="text-center px-2.5 py-1.5 rounded-lg hidden sm:block" style={{ background: "rgba(34,197,94,0.07)", minWidth: 52 }}>
            <p className="text-xs font-black tabular-nums" style={{ color: "#22c55e" }}>{row.correct ?? "—"}</p>
            <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.6rem" }}>CORRECT</p>
          </div>
          <div className="text-center px-2.5 py-1.5 rounded-lg hidden sm:block" style={{ background: "rgba(239,68,68,0.07)", minWidth: 52 }}>
            <p className="text-xs font-black tabular-nums" style={{ color: "#ef4444" }}>{row.incorrect ?? "—"}</p>
            <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.6rem" }}>WRONG</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllTimeStreakTable({ leaders, scopeLabel }) {
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ width: 210, border: "1px solid rgba(249,115,22,0.25)", background: "rgba(249,115,22,0.04)" }}>
      <div className="px-4 pt-3 pb-2">
        <p className="text-xs font-bold uppercase tracking-widest mb-0.5 truncate" title={`All-time · ${scopeLabel}`} style={{ color: "#fb923c" }}>
          All-Time · {scopeLabel}
        </p>
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
          🔥 Hottest Streak
        </p>
      </div>
      <div style={{ borderTop: "1px solid rgba(249,115,22,0.15)" }}>
        {leaders.map((row, i) => (
          <div key={row.userId} className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>{medal[i]}</span>
            <Avatar url={row.avatarUrl} username={row.username} size={22} />
            <span className="flex-1 truncate text-xs font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{row.username}</span>
            <span className="font-black tabular-nums text-sm" style={{ color: "#fb923c" }}>{row.bestStreak}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileStreakDrawer({ leaders, scopeLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const wasOpenRef = useRef(false);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const hottest = leaders[0];

  useModalA11y(closeDrawer, isOpen);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const handleBreakpoint = event => { if (event.matches) closeDrawer(); };
    desktop.addEventListener("change", handleBreakpoint);
    return () => desktop.removeEventListener("change", handleBreakpoint);
  }, [closeDrawer]);

  useEffect(() => {
    let focusFrame;
    if (isOpen) {
      wasOpenRef.current = true;
      focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus();
      wasOpenRef.current = false;
    }
    return () => { if (focusFrame) window.cancelAnimationFrame(focusFrame); };
  }, [isOpen]);

  return (
    <>
      <div className="lg:hidden fixed right-0 z-30" style={{ top: "48%", transform: "translateY(-50%)" }}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Open hottest streaks for ${scopeLabel}`}
          aria-expanded={isOpen}
          aria-controls="mobile-streak-drawer"
          tabIndex={isOpen ? -1 : 0}
          onClick={() => setIsOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 rounded-l-2xl transition-all duration-200 motion-reduce:transition-none ${isOpen ? "translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100"}`}
          style={{
            width: 48,
            minHeight: 104,
            color: "white",
            background: "linear-gradient(180deg,#f97316 0%,#c2410c 100%)",
            border: "1px solid rgba(255,190,120,0.45)",
            borderRight: 0,
            boxShadow: "-6px 0 24px rgba(249,115,22,0.28)",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "1.25rem", lineHeight: 1 }}>🔥</span>
          <span className="font-black tabular-nums" style={{ fontSize: "1.05rem", lineHeight: 1 }}>{hottest.bestStreak}</span>
          <span className="font-black uppercase" style={{ fontSize: "0.52rem", letterSpacing: "0.12em", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            Streaks
          </span>
        </button>
      </div>

      <div
        className={`lg:hidden fixed inset-0 z-[70] transition-opacity duration-200 motion-reduce:transition-none ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        aria-hidden={!isOpen}
      >
        <div className="absolute inset-0" style={{ background: "rgba(5,1,14,0.7)", backdropFilter: "blur(3px)" }} onClick={closeDrawer} />
        <section
          id="mobile-streak-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-streak-title"
          className={`absolute right-0 top-0 h-full flex flex-col transition-transform duration-200 ease-out motion-reduce:transition-none ${isOpen ? "translate-x-0" : "translate-x-full"}`}
          style={{
            width: "min(86vw, 320px)",
            background: "linear-gradient(180deg,#210737 0%,#130421 100%)",
            borderLeft: "1px solid rgba(249,115,22,0.3)",
            boxShadow: "-20px 0 60px rgba(0,0,0,0.55)",
          }}
        >
          <div className="flex items-start gap-3 px-5 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(249,115,22,0.16)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.25)", fontSize: "1.15rem" }}>
              🔥
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest truncate" title={scopeLabel} style={{ color: "#fb923c" }}>{scopeLabel}</p>
              <h2 id="mobile-streak-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.55rem", color: "white", letterSpacing: "0.05em", lineHeight: 1.1 }}>
                Hottest Streaks
              </h2>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>All-time consecutive correct picks</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              tabIndex={isOpen ? 0 : -1}
              aria-label="Close hottest streaks"
              onClick={closeDrawer}
              className="w-11 h-11 -mt-1 -mr-2 rounded-full flex items-center justify-center shrink-0 transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {leaders.map((row, index) => (
              <div
                key={row.userId}
                className="flex items-center gap-3 rounded-2xl px-3 py-3"
                style={{
                  background: index === 0 ? "linear-gradient(90deg,rgba(249,115,22,0.16),rgba(249,115,22,0.05))" : "rgba(255,255,255,0.04)",
                  border: index === 0 ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <span aria-hidden="true" style={{ fontSize: "1.2rem", lineHeight: 1 }}>{["🥇", "🥈", "🥉"][index]}</span>
                <Avatar url={row.avatarUrl} username={row.username} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "rgba(255,255,255,0.92)" }}>{row.username}</p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.48)" }}>Best run</p>
                </div>
                <div className="rounded-xl px-2.5 py-1.5 text-center shrink-0" style={{ background: "rgba(249,115,22,0.12)" }}>
                  <p className="font-black tabular-nums" style={{ color: "#fb923c", fontSize: "1.05rem", lineHeight: 1 }}>{row.bestStreak}</p>
                  <p className="uppercase font-bold mt-1" style={{ color: "rgba(251,146,60,0.65)", fontSize: "0.48rem", letterSpacing: "0.08em", lineHeight: 1 }}>Games</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export default function Leaderboard({ initialLeague = null, onViewProfile }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialLeague ? initialLeague.id : "global");
  const [myLeagues, setMyLeagues] = useState(initialLeague ? [initialLeague] : []);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("league_members")
      .select("league_id, leagues(id, name)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const leagues = (data ?? []).map(r => r.leagues).filter(Boolean);
        if (initialLeague && !leagues.find(l => l.id === initialLeague.id)) {
          setMyLeagues([initialLeague, ...leagues]);
        } else {
          setMyLeagues(leagues);
        }
      });
  }, [user]);

  useEffect(() => {
    setLoading(true);
    setRows([]);

    if (tab === "global") {
      Promise.all([
        supabase.from("profiles").select("id, username, avatar_url"),
        supabase.from("submissions").select("user_id, group_picks_count, updated_at, bracket, picks, confidence"),
        getMatchResults(),
      ]).then(([{ data: profiles }, { data: submissions }, resultsMap]) => {
        const subMap = Object.fromEntries((submissions ?? []).map(s => [s.user_id, s]));
        const merged = (profiles ?? []).map(p => {
          const sub = subMap[p.id];
          const scoring = sub?.picks
            ? calculateGroupScores(sub.picks, resultsMap, sub.confidence ?? {})
            : { points: null, correct: null, incorrect: null };
          const streaks = sub?.picks ? calculateStreaks(sub.picks, resultsMap) : { current: 0, best: 0 };
          return {
            userId:     p.id,
            username:   p.username ?? "—",
            avatarUrl:  p.avatar_url ?? null,
            pickCount:  sub?.group_picks_count ?? 0,
            updatedAt:  sub?.updated_at ?? null,
            hasBracket: !!sub,
            champion:   sub?.bracket?.F?.[0] ?? null,
            finalist:   sub?.bracket?.F?.[1] ?? null,
            third:      sub?.bracket?.["3P"]?.[0] ?? null,
            semis:      (sub?.bracket?.SF ?? []).filter(Boolean),
            points:     scoring.points,
            correct:    scoring.correct,
            incorrect:  scoring.incorrect,
            streak:     streaks.current,
            bestStreak: streaks.best,
          };
        }).sort((a, b) => {
          if (b.points !== a.points) return (b.points ?? -1) - (a.points ?? -1);
          return b.pickCount - a.pickCount;
        });
        setRows(merged);
        setTotal(merged.length);
        setLoading(false);
      });
    } else {
      getLeagueLeaderboard(tab)
        .then(data => { setRows(data); setTotal(data.length); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [tab]);

  const isLeagueTab = tab !== "global";
  const currentLeagueName = myLeagues.find(l => l.id === tab)?.name ?? "";
  const streakScopeLabel = isLeagueTab ? currentLeagueName : "Global";
  const streakLeaders = useMemo(() => selectHottestStreaks(rows), [rows]);
  const showStreaks = !loading && streakLeaders.length > 0;

  return (
    <div className="mx-auto px-4 py-8" style={{ maxWidth: "calc(48rem + 230px)" }}>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Rankings</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
          {isLeagueTab ? currentLeagueName : "Leaderboard"}
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>
          {isLeagueTab ? "Each player's entered bracket picks" : "Ranked by points — ×2/×3 confidence boosts pay extra when they land, and hot streaks get a 🔥"}
        </p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[{ id: "global", name: "Global" }, ...myLeagues.map(l => ({ id: l.id, name: l.name }))].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={{
              background: tab === t.id ? "#c8f000" : "rgba(255,255,255,0.06)",
              color: tab === t.id ? "#1a0533" : "rgba(255,255,255,0.5)",
              border: tab === t.id ? "none" : "1px solid rgba(255,255,255,0.1)",
            }}>
            {t.name}
          </button>
        ))}
      </div>

      {showStreaks && (
        <MobileStreakDrawer key={tab} leaders={streakLeaders} scopeLabel={streakScopeLabel} />
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Leaderboard — always first / full width on mobile */}
        <div className="w-full lg:flex-1 min-w-0 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Loading…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Nobody's on the board yet — be the first to submit a bracket!</p>
            </div>
          ) : (
            rows.map((row, i) => (
              <LeagueRow key={row.userId} row={row} rank={i + 1} isMe={user && row.userId === user.id} onViewProfile={onViewProfile} />
            ))
          )}
        </div>

        {/* Desktop-only sidebar */}
        {showStreaks && (
          <div className="hidden lg:block shrink-0">
            <AllTimeStreakTable leaders={streakLeaders} scopeLabel={streakScopeLabel} />
          </div>
        )}
      </div>

    </div>
  );
}
