import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import fixtures from "../data/wc2026_fixtures.json";

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

// ── Main Admin component ──────────────────────────────────────────────────────

export default function Admin({ onClose }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState("submissions");

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
    { id: "submissions", label: "Submissions" },
    { id: "results",     label: "Match Results" },
    { id: "leagues",     label: "Leagues" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.95)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
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
        <div className="flex shrink-0 px-6 pt-3 gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
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
          {tab === "submissions" && <SubmissionsTab />}
          {tab === "results"     && <ResultsTab />}
          {tab === "leagues"     && <LeaguesTab />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 shrink-0 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)" }}>
          To auto-fetch results from API-Football, run: <span style={{ color: "rgba(200,240,0,0.4)", fontFamily: "monospace" }}>npm run fetch-results</span>
        </div>
      </div>
    </div>
  );
}
