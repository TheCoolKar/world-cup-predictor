import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { getLeagueLeaderboard } from "../utils/social";
import { getFlagClass } from "../utils/flags";

const PAGE_SIZE = 50;

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

function TeamFlag({ name }) {
  if (!name) return null;
  const cls = getFlagClass(name);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
      {cls && <span className={cls} style={{ fontSize: "0.9rem" }} />}
      {name}
    </span>
  );
}

function BracketSummary({ champion, finalist, semis }) {
  if (!champion && !finalist && (!semis || semis.length === 0)) {
    return <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>No bracket picks yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-1.5">
      {champion && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#FFD700" }}>🏆</span>
          <TeamFlag name={champion} />
        </div>
      )}
      {finalist && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C0C0C0" }}>🥈</span>
          <TeamFlag name={finalist} />
        </div>
      )}
      {semis.filter(t => t !== champion && t !== finalist).map(team => (
        <div key={team} className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>SF</span>
          <TeamFlag name={team} />
        </div>
      ))}
    </div>
  );
}

// League leaderboard row — shows bracket inline
function LeagueRow({ row, rank, isMe }) {
  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.05)",
      background: isMe ? "rgba(200,240,0,0.04)" : "transparent",
      padding: "14px 20px",
    }}>
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
              <span className="text-xs hidden sm:inline" style={{ color: "rgba(255,255,255,0.25)" }}>
                · {new Date(row.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {row.hasBracket
            ? <BracketSummary champion={row.champion} finalist={row.finalist} semis={row.semis ?? []} />
            : <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>Hasn't entered a bracket yet</p>
          }
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard({ initialLeague = null }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialLeague ? initialLeague.id : "global");
  const [myLeagues, setMyLeagues] = useState(initialLeague ? [initialLeague] : []);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
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
      supabase
        .from("submissions")
        .select("user_id, group_picks_count, updated_at, profiles(username, avatar_url)", { count: "exact" })
        .order("group_picks_count", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
        .then(({ data, count, error }) => {
          if (!error) {
            setRows((data ?? []).map(r => ({
              userId: r.user_id,
              username: r.profiles?.username ?? "—",
              avatarUrl: r.profiles?.avatar_url ?? null,
              pickCount: r.group_picks_count ?? 0,
              updatedAt: r.updated_at,
              hasBracket: true,
            })));
            setTotal(count ?? 0);
          }
          setLoading(false);
        });
    } else {
      getLeagueLeaderboard(tab)
        .then(data => { setRows(data); setTotal(data.length); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [tab, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isLeagueTab = tab !== "global";
  const currentLeagueName = myLeagues.find(l => l.id === tab)?.name ?? "";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Rankings</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
          {isLeagueTab ? currentLeagueName : "Leaderboard"}
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
          {isLeagueTab ? "Each player's entered bracket picks" : "Ranked by group stage picks submitted"}
        </p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[{ id: "global", name: "Global" }, ...myLeagues.map(l => ({ id: l.id, name: l.name }))].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setPage(0); }}
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
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No submissions yet.</p>
          </div>
        ) : isLeagueTab ? (
          // League view: bracket cards
          rows.map((row, i) => (
            <LeagueRow key={row.userId} row={row} rank={i + 1} isMe={user && row.userId === user.id} />
          ))
        ) : (
          // Global view: compact table
          <table className="w-full text-sm">
            <thead style={{ background: "rgba(255,255,255,0.03)" }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)", width: 48 }}>#</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>Player</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>Picks</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider hidden sm:table-cell" style={{ color: "rgba(255,255,255,0.3)" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rank = page * PAGE_SIZE + i + 1;
                const isMe = user && row.userId === user.id;
                return (
                  <tr key={row.userId} style={{
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: isMe ? "rgba(200,240,0,0.04)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}>
                    <td className="px-4 py-3"><RankBadge rank={rank} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar url={row.avatarUrl} username={row.username} size={28} />
                        <span className="font-semibold" style={{ color: isMe ? "#c8f000" : "rgba(255,255,255,0.85)" }}>
                          {row.username}{isMe && <span className="ml-1 text-xs" style={{ color: "rgba(200,240,0,0.6)" }}>(you)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-black tabular-nums" style={{ color: "#c8f000" }}>{row.pickCount}</td>
                    <td className="px-4 py-3 text-right text-xs hidden sm:table-cell" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {tab === "global" && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: "rgba(255,255,255,0.06)", color: page === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)", cursor: page === 0 ? "not-allowed" : "pointer" }}>
            ← Prev
          </button>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: "rgba(255,255,255,0.06)", color: page >= totalPages - 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
