import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import fixtures from "../data/wc2026_fixtures.json";
import { aggregateUserActivity, featureLabel, formatDuration, pageLabel } from "../utils/analytics";

const TOTAL_MATCHES = 48;

// ── Results Tab ───────────────────────────────────────────────────────────────

function ResultsTab() {
  const [results, setResults]   = useState({});   // { matchId: { home_score, away_score, result, source } }
  const [scores,  setScores]    = useState({});   // { matchId: { home: "", away: "" } }
  const [saving,  setSaving]    = useState({});   // { matchId: true }
  const [saved,   setSaved]     = useState({});   // { matchId: true }
  const [loadErr, setLoadErr]   = useState(null);

  // Group stage only (48 matches: A1–L6)
  const groupFixtures = fixtures.filter(f => /^[A-L]\d$/.test(f.id));

  // Load existing results
  useEffect(() => {
    supabase
      .from("match_results")
      .select("match_id, home_score, away_score, result, source")
      .then(({ data, error }) => {
        if (error) { setLoadErr(error.message); return; }
        const map = {};
        const scoreMap = {};
        for (const r of data ?? []) {
          map[r.match_id] = r;
          scoreMap[r.match_id] = { home: String(r.home_score ?? ""), away: String(r.away_score ?? "") };
        }
        setResults(map);
        setScores(scoreMap);
      });
  }, []);

  function handleScore(matchId, side, value) {
    setScores(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { home: "", away: "" }), [side]: value },
    }));
    setSaved(prev => ({ ...prev, [matchId]: false }));
  }

  async function saveResult(matchId) {
    const s = scores[matchId] ?? {};
    const h = parseInt(s.home, 10);
    const a = parseInt(s.away, 10);
    if (isNaN(h) || isNaN(a)) return;

    let result;
    if (h > a)      result = "home";
    else if (a > h) result = "away";
    else            result = "draw";

    setSaving(prev => ({ ...prev, [matchId]: true }));

    const { error } = await supabase.from("match_results").upsert({
      match_id:   matchId,
      home_score: h,
      away_score: a,
      result,
      source:     "manual",
      updated_at: new Date().toISOString(),
    }, { onConflict: "match_id" });

    setSaving(prev => ({ ...prev, [matchId]: false }));
    if (!error) {
      setResults(prev => ({ ...prev, [matchId]: { match_id: matchId, home_score: h, away_score: a, result, source: "manual" } }));
      setSaved(prev => ({ ...prev, [matchId]: true }));
    }
  }

  // Group by group letter
  const groups = ["A","B","C","D","E","F","G","H","I","J","K","L"];

  return (
    <div className="p-4 space-y-6">
      {loadErr && (
        <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          Failed to load results: {loadErr}
        </div>
      )}

      <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
        Enter scores to compute H/D/A result. Save overwrites any API-fetched value.
      </p>

      {groups.map(g => {
        const gFixtures = groupFixtures.filter(f => f.group === g);
        if (!gFixtures.length) return null;
        return (
          <div key={g}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#c8f000" }}>
              Group {g}
            </p>
            <div className="space-y-2">
              {gFixtures.map(f => {
                const existing = results[f.id];
                const s = scores[f.id] ?? { home: "", away: "" };
                const isSaving = saving[f.id];
                const isSaved  = saved[f.id];
                return (
                  <div key={f.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: existing ? "rgba(200,240,0,0.04)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${existing ? "rgba(200,240,0,0.12)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    {/* Match ID */}
                    <span className="text-xs font-bold w-6 shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>{f.id}</span>

                    {/* Teams */}
                    <span className="flex-1 text-sm font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
                      {f.home} <span style={{ color: "rgba(255,255,255,0.6)" }}>vs</span> {f.away}
                    </span>

                    {/* Score inputs */}
                    <input
                      type="number" min="0" max="20" value={s.home}
                      onChange={e => handleScore(f.id, "home", e.target.value)}
                      placeholder="—"
                      className="w-10 text-center text-sm font-bold rounded-lg px-1 py-1.5 outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.75rem" }}>:</span>
                    <input
                      type="number" min="0" max="20" value={s.away}
                      onChange={e => handleScore(f.id, "away", e.target.value)}
                      placeholder="—"
                      className="w-10 text-center text-sm font-bold rounded-lg px-1 py-1.5 outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                    />

                    {/* Result badge */}
                    {existing && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: existing.source === "api" ? "rgba(59,130,246,0.12)" : "rgba(200,240,0,0.1)",
                          color:      existing.source === "api" ? "#60a5fa" : "#c8f000",
                          border:     `1px solid ${existing.source === "api" ? "rgba(59,130,246,0.2)" : "rgba(200,240,0,0.2)"}`,
                        }}
                      >
                        {existing.result.toUpperCase()} · {existing.source}
                      </span>
                    )}

                    {/* Save button */}
                    <button
                      onClick={() => saveResult(f.id)}
                      disabled={isSaving || (s.home === "" || s.away === "")}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-opacity"
                      style={{
                        background: isSaved ? "rgba(200,240,0,0.15)" : "rgba(200,240,0,0.08)",
                        color:      isSaved ? "#c8f000" : "rgba(200,240,0,0.6)",
                        border:     "1px solid rgba(200,240,0,0.15)",
                        opacity:    (s.home === "" || s.away === "") ? 0.4 : 1,
                      }}
                    >
                      {isSaving ? "…" : isSaved ? "✓ Saved" : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Submissions Tab ───────────────────────────────────────────────────────────

function SubmissionsTab() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [sort,    setSort]    = useState("submitted_at");
  const [asc,     setAsc]     = useState(false);

  useEffect(() => {
    supabase
      .from("submissions")
      .select("id, email, display_name, group_picks_count, submitted_at, updated_at")
      .order(sort, { ascending: asc })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data ?? []);
        setLoading(false);
      });
  }, [sort, asc]);

  function toggleSort(col) {
    if (sort === col) setAsc(p => !p);
    else { setSort(col); setAsc(false); }
  }

  const th = (label, col) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none"
      style={{ color: sort === col ? "#c8f000" : "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}
    >
      {label} {sort === col ? (asc ? "↑" : "↓") : ""}
    </th>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Loading submissions…</p>
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
    </div>
  );
  if (!rows.length) return (
    <div className="flex flex-col items-center justify-center h-40 gap-2">
      <span className="text-3xl">📭</span>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>No submissions yet.</p>
    </div>
  );

  return (
    <table className="w-full text-sm">
      <thead style={{ background: "rgba(255,255,255,0.03)", position: "sticky", top: 0 }}>
        <tr>
          {th("Name", "display_name")}
          {th("Email", "email")}
          {th("Group Picks", "group_picks_count")}
          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
            style={{ color: "rgba(255,255,255,0.7)" }}>Complete?</th>
          {th("Submitted", "submitted_at")}
          {th("Last Update", "updated_at")}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const complete = row.group_picks_count >= TOTAL_MATCHES;
          return (
            <tr key={row.id}
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
              <td className="px-4 py-3 font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                {row.display_name || "—"}
              </td>
              <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                {row.email}
              </td>
              <td className="px-4 py-3">
                <span className="font-black" style={{ color: complete ? "#c8f000" : "#f59e0b" }}>
                  {row.group_picks_count}
                </span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.7rem" }}>
                  /{TOTAL_MATCHES}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: complete ? "rgba(200,240,0,0.1)" : "rgba(245,158,11,0.1)",
                    color: complete ? "#c8f000" : "#f59e0b",
                    border: `1px solid ${complete ? "rgba(200,240,0,0.2)" : "rgba(245,158,11,0.2)"}`,
                  }}
                >
                  {complete ? "✓ Full" : "Partial"}
                </span>
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                {new Date(row.submitted_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                {new Date(row.updated_at).toLocaleString()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Leagues Tab ───────────────────────────────────────────────────────────────

function LeaguesTab() {
  const [leagues,  setLeagues]  = useState([]);
  const [members,  setMembers]  = useState({});   // { leagueId: [{ user_id, joined_at, profile }] }
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(null); // leagueId

  useEffect(() => {
    async function load() {
      const [leaguesRes, membersRes] = await Promise.all([
        supabase.from("leagues")
          .select("id, name, description, join_code, is_public, creator_id, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("league_members").select("league_id, user_id, joined_at"),
      ]);
      const err = leaguesRes.error ?? membersRes.error;
      if (err) { setError(err.message); setLoading(false); return; }

      const leagueRows = leaguesRes.data ?? [];
      const memberRows = membersRes.data ?? [];
      const userIds = [...new Set([...memberRows.map(m => m.user_id), ...leagueRows.map(l => l.creator_id)])];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, username, avatar_url").in("id", userIds)
        : { data: [] };
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

      const grouped = {};
      for (const m of memberRows) {
        (grouped[m.league_id] ??= []).push({ ...m, profile: profileMap[m.user_id] });
      }
      setLeagues(leagueRows.map(l => ({ ...l, creator: profileMap[l.creator_id] })));
      setMembers(grouped);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Loading leagues…</p>
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
    </div>
  );
  if (!leagues.length) return (
    <div className="flex flex-col items-center justify-center h-40 gap-2">
      <span className="text-3xl">🏟️</span>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>No leagues created yet.</p>
    </div>
  );

  return (
    <div className="p-4 space-y-2">
      <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.65)" }}>
        {leagues.length} league{leagues.length !== 1 ? "s" : ""} · click a league to see its members
      </p>
      {leagues.map(lg => {
        const lgMembers = members[lg.id] ?? [];
        const isOpen = expanded === lg.id;
        return (
          <div key={lg.id} className="rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isOpen ? "rgba(200,240,0,0.2)" : "rgba(255,255,255,0.06)"}` }}>

            {/* League row */}
            <button onClick={() => setExpanded(isOpen ? null : lg.id)}
              className="w-full text-left px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.9)" }}>{lg.name}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: lg.is_public ? "rgba(200,240,0,0.1)" : "rgba(168,85,247,0.12)",
                      color:      lg.is_public ? "#c8f000" : "#c084fc",
                      border:     `1px solid ${lg.is_public ? "rgba(200,240,0,0.2)" : "rgba(168,85,247,0.25)"}`,
                    }}>
                    {lg.is_public ? "Public" : "Private"}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Code: <span className="font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>{lg.join_code}</span>
                  {" · "}created by {lg.creator?.username ?? "—"}
                  {" · "}{new Date(lg.created_at).toLocaleDateString()}
                </p>
              </div>
              <span className="text-xs font-bold shrink-0 px-2 py-1 rounded-lg"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>
                {lgMembers.length} member{lgMembers.length !== 1 ? "s" : ""}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round"
                style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Member list */}
            {isOpen && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {lgMembers.length === 0 ? (
                  <p className="text-xs px-4 py-3" style={{ color: "rgba(255,255,255,0.6)" }}>No members.</p>
                ) : lgMembers.map((m, i) => (
                  <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5"
                    style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    {m.profile?.avatar_url ? (
                      <img src={m.profile.avatar_url} alt="" className="rounded-full object-cover shrink-0" style={{ width: 26, height: 26 }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center shrink-0 font-bold text-xs"
                        style={{ width: 26, height: 26, background: "rgba(200,240,0,0.15)", color: "#c8f000" }}>
                        {m.profile?.username?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <span className="text-sm font-semibold flex-1" style={{ color: "rgba(255,255,255,0.8)" }}>
                      {m.profile?.username ?? m.user_id}
                      {m.user_id === lg.creator_id && (
                        <span className="ml-1.5 text-xs font-bold" style={{ color: "#c8f000" }}>👑 creator</span>
                      )}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>
                      joined {new Date(m.joined_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsMetric({ label, value, detail, accent = "#c8f000" }) {
  return (
    <div className="rounded-xl p-4 min-w-0"
      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</p>
      <p className="font-black tabular-nums mt-1" style={{ color: accent, fontSize: "1.65rem", lineHeight: 1.1 }}>{value}</p>
      {detail && <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{detail}</p>}
    </div>
  );
}

function RankedUsageList({ title, rows, valueKey, labelFor, emptyText }) {
  const maximum = Math.max(1, ...rows.map(row => Number(row[valueKey]) || 0));
  return (
    <section className="rounded-xl p-4"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="font-black text-white mb-3">{title}</h3>
      {!rows.length ? (
        <p className="text-sm py-6 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const value = Number(row[valueKey]) || 0;
            const key = row.page ?? row.event_name;
            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                  <span className="font-semibold truncate" style={{ color: "rgba(255,255,255,0.78)" }}>{labelFor(key)}</span>
                  <span className="font-black tabular-nums shrink-0" style={{ color: "#c8f000" }}>{value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(4, (value / maximum) * 100)}%`, background: "linear-gradient(90deg,#84cc16,#c8f000)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

async function loadDirectUserActivity(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [sessionResult, eventResult] = await Promise.all([
    supabase
      .from("app_sessions")
      .select("user_id, active_seconds, page_views, last_seen_at")
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(5000),
    supabase
      .from("app_activity_events")
      .select("user_id, event_name, created_at")
      .not("user_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (eventResult.error) throw eventResult.error;

  const sessions = sessionResult.data ?? [];
  const events = eventResult.data ?? [];
  const userIds = [...new Set([
    ...sessions.map(row => row.user_id),
    ...events.map(row => row.user_id),
  ].filter(Boolean))].slice(0, 500);

  if (!userIds.length) return aggregateUserActivity({ sessions, events });

  const [profileResult, termsResult] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").in("id", userIds),
    supabase
      .from("terms_acceptances")
      .select("user_id, email, accepted_at")
      .in("user_id", userIds)
      .not("email", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(1000),
  ]);

  return aggregateUserActivity({
    sessions,
    events,
    profiles: profileResult.data ?? [],
    terms: termsResult.data ?? [],
  });
}

function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [userSort, setUserSort] = useState("active_seconds");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function changeRange(nextDays) {
    setLoading(true);
    setError(null);
    setDays(nextDays);
  }

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey(key => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.rpc("get_app_analytics", { p_days: days }),
      loadDirectUserActivity(days).catch(() => null),
    ]).then(([{ data, error: loadError }, directUserActivity]) => {
      if (cancelled) return;
      if (loadError) setError(loadError.message);
      else setAnalytics(directUserActivity ? { ...data, ...directUserActivity } : data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [days, refreshKey]);

  if (loading && !analytics) return (
    <div className="flex items-center justify-center h-52">
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Building engagement report…</p>
    </div>
  );

  if (error && !analytics) return (
    <div className="m-4 p-4 rounded-xl text-sm" style={{ color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
      Analytics could not load: {error}
    </div>
  );

  const daily = analytics?.daily ?? [];
  const maxActive = Math.max(1, ...daily.map(day => Number(day.active_users) || 0));
  const generatedAt = analytics?.generated_at ? new Date(analytics.generated_at) : null;
  const topUsers = [...(analytics?.top_users ?? [])]
    .sort((a, b) => (Number(b[userSort]) || 0) - (Number(a[userSort]) || 0))
    .slice(0, 25);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-white text-lg">App engagement</h3>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
            First-party usage only · active time excludes hidden and idle tabs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
            {[7, 30, 90].map(option => (
              <button key={option} onClick={() => changeRange(option)}
                className="px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                style={{ background: days === option ? "rgba(200,240,0,0.14)" : "transparent", color: days === option ? "#c8f000" : "rgba(255,255,255,0.45)" }}>
                {option}d
              </button>
            ))}
          </div>
          <button onClick={refresh} disabled={loading} className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", opacity: loading ? 0.5 : 1 }}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AnalyticsMetric label="Daily active" value={Number(analytics?.dau ?? 0).toLocaleString()} detail="Today" />
        <AnalyticsMetric label="Weekly active" value={Number(analytics?.wau ?? 0).toLocaleString()} detail="Last 7 days" accent="#60a5fa" />
        <AnalyticsMetric label="Monthly active" value={Number(analytics?.mau ?? 0).toLocaleString()} detail="Last 30 days" accent="#c084fc" />
        <AnalyticsMetric label="Return rate" value={`${Number(analytics?.return_rate ?? 0).toFixed(1)}%`} detail="2+ sessions in 30d" accent="#fb923c" />
        <AnalyticsMetric label="Sessions" value={Number(analytics?.sessions ?? 0).toLocaleString()} detail={`Selected ${days} days`} />
        <AnalyticsMetric label="Page views" value={Number(analytics?.page_views ?? 0).toLocaleString()} detail={`Selected ${days} days`} accent="#60a5fa" />
        <AnalyticsMetric label="Avg. active time" value={formatDuration(analytics?.avg_active_seconds)} detail="Per session" accent="#fb923c" />
        <AnalyticsMetric
          label="Identified traffic"
          value={`${Number(analytics?.identified_traffic_rate ?? 0).toFixed(1)}%`}
          detail={`${Number(analytics?.identified_users ?? 0).toLocaleString()} signed-in users`}
          accent="#c084fc"
        />
      </div>

      <section className="rounded-xl p-4 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-white">Active users by day</h3>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{days}-day view</span>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex items-end gap-1.5 h-36" style={{ minWidth: days > 30 ? 720 : 0 }}>
            {daily.map((day) => {
              const activeUsers = Number(day.active_users) || 0;
              const date = new Date(`${day.day}T00:00:00`);
              return (
                <div key={day.day} className="flex-1 min-w-[8px] h-full flex flex-col justify-end group" title={`${date.toLocaleDateString()}: ${activeUsers} active`}>
                  <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(activeUsers ? 5 : 1, (activeUsers / maxActive) * 100)}%`, background: activeUsers ? "linear-gradient(180deg,#c8f000,#65a30d)" : "rgba(255,255,255,0.06)" }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            <span>{daily[0]?.day ? new Date(`${daily[0].day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
            <span>{daily.at(-1)?.day ? new Date(`${daily.at(-1).day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="p-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h3 className="font-black text-white">Most active signed-in users</h3>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.42)" }}>
              {Number(analytics?.identified_page_views ?? 0).toLocaleString()} identified and {Number(analytics?.anonymous_page_views ?? 0).toLocaleString()} anonymous page views
            </p>
          </div>
          <div className="flex rounded-lg p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
            {[
              ["active_seconds", "Active time"],
              ["page_views", "Traffic"],
              ["sessions", "Sessions"],
            ].map(([value, label]) => (
              <button key={value} onClick={() => setUserSort(value)}
                className="px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors"
                style={{ background: userSort === value ? "rgba(200,240,0,0.14)" : "transparent", color: userSort === value ? "#c8f000" : "rgba(255,255,255,0.45)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {!topUsers.length ? (
          <p className="text-sm py-10 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
            Signed-in user activity will appear here as it is recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 760 }}>
              <thead style={{ background: "rgba(255,255,255,0.025)" }}>
                <tr>
                  {["User", "Sessions", "Page views", "Active time", "Actions", "Last active"].map(label => (
                    <th key={label} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "rgba(255,255,255,0.38)" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topUsers.map((row, index) => {
                  const displayName = row.username || row.email?.split("@")[0] || "User";
                  const lastActive = row.last_active_at ? new Date(row.last_active_at) : null;
                  return (
                    <tr key={row.user_id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 text-xs font-black tabular-nums" style={{ color: index < 3 ? "#c8f000" : "rgba(255,255,255,0.28)" }}>{index + 1}</span>
                          {row.avatar_url ? (
                            <img src={row.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-black"
                              style={{ color: "#c8f000", background: "rgba(200,240,0,0.1)" }}>{displayName[0]?.toUpperCase()}</span>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{displayName}</p>
                            <p className="text-[10px] truncate max-w-[220px]" style={{ color: "rgba(255,255,255,0.35)" }}>{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.72)" }}>{Number(row.sessions ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold tabular-nums" style={{ color: "#60a5fa" }}>{Number(row.page_views ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold tabular-nums" style={{ color: "#fb923c" }}>{formatDuration(row.active_seconds)}</td>
                      <td className="px-4 py-3 font-bold tabular-nums" style={{ color: "#c8f000" }}>{Number(row.feature_actions ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "rgba(255,255,255,0.45)" }}>
                        {lastActive ? lastActive.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-3 text-[10px]" style={{ color: "rgba(255,255,255,0.28)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          Activity before sign-in stays anonymous and is never guessed or retroactively assigned to an account.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <RankedUsageList title="Most visited pages" rows={analytics?.popular_pages ?? []} valueKey="views" labelFor={pageLabel} emptyText="Page views will appear as people explore the app." />
        <RankedUsageList title="Popular features" rows={analytics?.popular_features ?? []} valueKey="uses" labelFor={featureLabel} emptyText="Feature actions will appear after people save picks or use leagues." />
      </div>

      {generatedAt && (
        <p className="text-right text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          Updated {generatedAt.toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ── Terms Log Tab ─────────────────────────────────────────────────────────────

function TermsLogTab() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("terms_acceptances")
        .select("id, user_id, email, version, user_agent, accepted_at")
        .order("accepted_at", { ascending: false })
        .limit(500);

      if (error) { setError(error.message); setLoading(false); return; }

      const rows = data ?? [];
      // For rows that have a user_id but no email, look up the profile username
      const unknownIds = [...new Set(rows.filter(r => r.user_id && !r.email).map(r => r.user_id))];
      let profileMap = {};
      if (unknownIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", unknownIds);
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.username]));
      }

      setRows(rows.map(r => ({ ...r, username: r.user_id ? (profileMap[r.user_id] ?? null) : null })));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Loading terms log…</p>
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-40">
      <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
    </div>
  );
  if (!rows.length) return (
    <div className="flex flex-col items-center justify-center h-40 gap-2">
      <span className="text-3xl">📭</span>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>No acceptances logged yet.</p>
    </div>
  );

  return (
    <div>
      <p className="px-4 pt-4 text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
        {rows.length} acceptance{rows.length === 1 ? "" : "s"} logged (latest 500 shown).
        Anonymous rows are visitors who accepted before signing in.
      </p>
      <table className="w-full text-sm mt-3">
        <thead style={{ background: "rgba(255,255,255,0.03)", position: "sticky", top: 0 }}>
          <tr>
            {["User", "Version", "Accepted At", "Device"].map(label => (
              <th key={label} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id}
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
              <td className="px-4 py-3">
                {row.email
                  ? <span className="font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{row.email}</span>
                  : row.username
                    ? <span className="font-semibold" style={{ color: "#a5b4fc" }}>@{row.username}</span>
                    : row.user_id
                      ? <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.4)" }} title={row.user_id}>{row.user_id.slice(0, 8)}…</span>
                      : <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          Anonymous
                        </span>
                }
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(200,240,0,0.1)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}>
                  {row.version}
                </span>
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                {new Date(row.accepted_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.45)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={row.user_agent ?? ""}>
                {row.user_agent ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Admin component ──────────────────────────────────────────────────────

export default function Admin({ onClose }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState("analytics");

  if (!profile?.is_admin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(10,2,26,0.95)", backdropFilter: "blur(8px)" }}>
        <div className="text-center">
          <p className="text-white font-bold text-lg mb-2">Access Denied</p>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.7)" }}>Admin access only.</p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const TABS = [
    { id: "analytics",   label: "Analytics" },
    { id: "submissions", label: "Submissions" },
    { id: "results",     label: "Match Results" },
    { id: "leagues",     label: "Leagues" },
    { id: "terms",       label: "Terms Log" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.95)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
          border: "1px solid rgba(200,240,0,0.12)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: "#c8f000" }}>
              Organizer View
            </p>
            <h2
              className="text-white leading-none"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", letterSpacing: "0.04em" }}
            >
              Admin Panel
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 px-4 md:px-6 pt-3 gap-2 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 pb-3 text-sm font-bold transition-colors"
              style={{
                color:       tab === t.id ? "#c8f000" : "rgba(255,255,255,0.35)",
                borderBottom: tab === t.id ? "2px solid #c8f000" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {tab === "analytics"   && <AnalyticsTab />}
          {tab === "submissions" && <SubmissionsTab />}
          {tab === "results"     && <ResultsTab />}
          {tab === "leagues"     && <LeaguesTab />}
          {tab === "terms"       && <TermsLogTab />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 shrink-0 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)" }}>
          To auto-fetch results from API-Football, run: <span style={{ color: "rgba(200,240,0,0.4)", fontFamily: "monospace" }}>npm run fetch-results</span>
        </div>
      </div>
    </div>
  );
}
