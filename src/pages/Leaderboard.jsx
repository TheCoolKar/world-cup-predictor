import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { getLeagueLeaderboard, getMatchResults } from "../utils/social";
import { calculateGroupScores } from "../utils/scoring";
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
        supabase.from("submissions").select("user_id, group_picks_count, updated_at, bracket, picks"),
        getMatchResults(),
      ]).then(([{ data: profiles }, { data: submissions }, resultsMap]) => {
        const subMap = Object.fromEntries((submissions ?? []).map(s => [s.user_id, s]));
        const merged = (profiles ?? []).map(p => {
          const sub = subMap[p.id];
          const scoring = sub?.picks
            ? calculateGroupScores(sub.picks, resultsMap)
            : { points: null, correct: null, incorrect: null };
          return {
            userId:    p.id,
            username:  p.username ?? "—",
            avatarUrl: p.avatar_url ?? null,
            pickCount: sub?.group_picks_count ?? 0,
            updatedAt: sub?.updated_at ?? null,
            hasBracket: !!sub,
            champion:  sub?.bracket?.F?.[0] ?? null,
            finalist:  sub?.bracket?.F?.[1] ?? null,
            third:     sub?.bracket?.["3P"]?.[0] ?? null,
            semis:     (sub?.bracket?.SF ?? []).filter(Boolean),
            points:    scoring.points,
            correct:   scoring.correct,
            incorrect: scoring.incorrect,
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Rankings</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
          {isLeagueTab ? currentLeagueName : "Leaderboard"}
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>
          {isLeagueTab ? "Each player's entered bracket picks" : "Everyone signed up — ranked by picks submitted"}
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

      {/* Entries */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>No submissions yet.</p>
          </div>
        ) : (
          // Both global and league: card rows
          rows.map((row, i) => (
            <LeagueRow key={row.userId} row={row} rank={i + 1} isMe={user && row.userId === user.id} onViewProfile={onViewProfile} />
          ))
        )}
      </div>

    </div>
  );
}
