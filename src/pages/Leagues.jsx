import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { generateJoinCode, getLeagueLeaderboard } from "../utils/social";
import { getFlagClass } from "../utils/flags";

// ── Shared helpers ────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "10px 14px", color: "white", fontSize: "0.875rem", outline: "none",
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.92)", backdropFilter: "blur(8px)" }}>
      <div className="relative w-full max-w-md rounded-2xl p-7"
        style={{ background: "linear-gradient(160deg,#1f0645,#160336)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-xs"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}>✕</button>
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", color: "white", letterSpacing: "0.04em", marginBottom: 20 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Avatar({ url, username, size = 30 }) {
  if (url) return <img src={url} alt={username} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, background: "rgba(200,240,0,0.15)", color: "#c8f000", fontSize: size * 0.38 }}>
      {username?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function RankBadge({ rank }) {
  const colors = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
  return (
    <span className="font-black tabular-nums shrink-0" style={{ color: colors[rank] ?? "rgba(255,255,255,0.25)", fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.1rem", minWidth: 24, display: "inline-block", textAlign: "center" }}>
      {rank}
    </span>
  );
}

function TeamFlag({ name }) {
  if (!name) return null;
  const cls = getFlagClass(name);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
      {cls && <span className={cls} style={{ fontSize: "0.85rem" }} />}
      {name}
    </span>
  );
}

// ── Bracket Picker Modal ──────────────────────────────────────────────────────

function BracketPickerModal({ leagueId, leagueName, onClose, onNavigate }) {
  const { user } = useAuth();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("submissions")
      .select("id, mode, group_picks_count, updated_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { setSubmission(data); setLoading(false); });
  }, [user]);

  async function handleSelect() {
    if (!submission) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase
      .from("league_members")
      .update({ submission_id: submission.id })
      .eq("league_id", leagueId)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setSaved(true);
  }

  if (loading) return (
    <Modal title="Enter Your Bracket" onClose={onClose}>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
    </Modal>
  );

  if (saved) return (
    <Modal title="You're In!" onClose={onClose}>
      <div className="text-center py-4">
        <div className="text-5xl mb-4">🏆</div>
        <p className="font-bold text-white mb-1">Bracket entered for</p>
        <p className="font-black mb-4" style={{ color: "#c8f000", fontSize: "1.1rem" }}>{leagueName}</p>
        <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
          {submission.group_picks_count} picks entered · good luck!
        </p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>Done</button>
      </div>
    </Modal>
  );

  return (
    <Modal title="Enter Your Bracket" onClose={onClose}>
      <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
        Select a bracket to compete with in <span style={{ color: "white", fontWeight: 600 }}>{leagueName}</span>.
        You can only enter one bracket per league.
      </p>
      {/* League rules callout */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg mb-5"
        style={{ background: "rgba(200,240,0,0.06)", border: "1px solid rgba(200,240,0,0.15)" }}>
        <span className="text-sm mt-0.5">ℹ️</span>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
          Leagues use <span style={{ color: "#c8f000", fontWeight: 700 }}>Winner Only</span> mode. Only brackets made in Winner Only mode can be entered. Score-mode brackets are not eligible.
        </p>
      </div>

      {!submission ? (
        <div className="text-center">
          <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
            You haven't made any picks yet. Complete a Winner Only bracket first.
          </p>
          <button onClick={() => { onClose(); onNavigate("groups"); }}
            className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
            Make My Picks
          </button>
        </div>
      ) : submission.mode === "score" ? (
        <div>
          <div className="rounded-xl px-4 py-3 mb-4"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-base">🚫</span>
              <p className="font-bold text-sm" style={{ color: "#ef4444" }}>Score Mode — Not Eligible</p>
            </div>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Your current bracket is in Score Mode. Leagues only accept Winner Only brackets.
            </p>
          </div>
          <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Go to <strong style={{ color: "white" }}>My Brackets</strong>, create a new bracket in <strong style={{ color: "#c8f000" }}>Winner Only</strong> mode, make your picks, then come back to enter it.
          </p>
          <button onClick={() => { onClose(); onNavigate("mine"); }}
            className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
            Go to My Brackets
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>My Brackets</p>
          <div className="rounded-xl px-4 py-3 mb-5"
            style={{ background: "rgba(200,240,0,0.07)", border: "1px solid rgba(200,240,0,0.25)" }}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <p className="font-bold text-sm" style={{ color: "white" }}>My Bracket</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000" }}>
                Winner Only ✓
              </span>
            </div>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {submission.group_picks_count} group picks · Last updated {new Date(submission.updated_at).toLocaleDateString()}
            </p>
          </div>
          {saveError && <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{saveError}</p>}
          <button onClick={handleSelect} disabled={saving}
            className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
            style={{ background: saving ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
            {saving ? "Entering…" : "Enter This Bracket"}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── League Rankings Tab ───────────────────────────────────────────────────────

function LeagueRankings({ leagueId }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeagueLeaderboard(leagueId)
      .then(data => { setRows(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [leagueId]);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading rankings…</p>
    </div>
  );

  if (rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <span className="text-3xl">📭</span>
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No members have entered a bracket yet.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 py-4">
      {rows.map((row, i) => {
        const isMe = user && row.userId === user.id;
        const rank = i + 1;
        return (
          <div key={row.userId} className="rounded-xl px-4 py-4"
            style={{
              background: isMe ? "rgba(200,240,0,0.05)" : "rgba(255,255,255,0.03)",
              border: isMe ? "1px solid rgba(200,240,0,0.2)" : "1px solid rgba(255,255,255,0.07)",
            }}>

            {/* Top row: rank + avatar + name + stats */}
            <div className="flex items-center gap-3">
              <RankBadge rank={rank} />
              <Avatar url={row.avatarUrl} username={row.username} size={32} />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-sm" style={{ color: isMe ? "#c8f000" : "rgba(255,255,255,0.9)" }}>
                  {row.username}
                  {isMe && <span className="ml-1 text-xs" style={{ color: "rgba(200,240,0,0.55)" }}>(you)</span>}
                </span>
              </div>

              {/* Stat chips */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-center px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(200,240,0,0.08)", minWidth: 52 }}>
                  <p className="text-xs font-black tabular-nums" style={{ color: "#c8f000" }}>
                    {row.points ?? "—"}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.6rem" }}>PTS</p>
                </div>
                <div className="text-center px-2.5 py-1.5 rounded-lg hidden sm:block" style={{ background: "rgba(34,197,94,0.07)", minWidth: 52 }}>
                  <p className="text-xs font-black tabular-nums" style={{ color: "#22c55e" }}>
                    {row.correct ?? "—"}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.6rem" }}>CORRECT</p>
                </div>
                <div className="text-center px-2.5 py-1.5 rounded-lg hidden sm:block" style={{ background: "rgba(239,68,68,0.07)", minWidth: 52 }}>
                  <p className="text-xs font-black tabular-nums" style={{ color: "#ef4444" }}>
                    {row.incorrect ?? "—"}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.6rem" }}>WRONG</p>
                </div>
              </div>
            </div>

            {/* Bottom row: bracket picks */}
            <div className="mt-2.5 pl-10">
              {row.hasBracket ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {row.champion && (
                    <div className="flex items-center gap-1">
                      <span style={{ fontSize: "0.8rem" }}>🏆</span>
                      <TeamFlag name={row.champion} />
                    </div>
                  )}
                  {row.finalist && row.finalist !== row.champion && (
                    <div className="flex items-center gap-1">
                      <span style={{ fontSize: "0.8rem" }}>🥈</span>
                      <TeamFlag name={row.finalist} />
                    </div>
                  )}
                  {(row.semis ?? []).filter(t => t && t !== row.champion && t !== row.finalist).map(team => (
                    <div key={team} className="flex items-center gap-1">
                      <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>SF</span>
                      <TeamFlag name={team} />
                    </div>
                  ))}
                  {!row.champion && !row.finalist && (
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Group picks only — no knockout picks yet</span>
                  )}
                </div>
              ) : (
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>No bracket entered yet</p>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}

// ── League Chat ───────────────────────────────────────────────────────────────

function LeagueChat({ leagueId }) {
  const { user, profile } = useAuth();
  const [messages, setMessages]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [text,     setText]       = useState("");
  const [sending,  setSending]    = useState(false);
  const bottomRef = useRef(null);

  // Load history + poll for new messages every 3s
  useEffect(() => {
    let lastTs = null;

    async function fetchMessages(initial = false) {
      const query = supabase
        .from("league_messages")
        .select("id, content, created_at, user_id, profiles(username, avatar_url)")
        .eq("league_id", leagueId)
        .order("created_at", { ascending: true });

      if (!initial && lastTs) {
        query.gt("created_at", lastTs);
      } else {
        query.limit(50);
      }

      const { data } = await query;
      if (!data?.length) {
        if (initial) setLoading(false);
        return;
      }

      lastTs = data[data.length - 1].created_at;

      if (initial) {
        setMessages(data);
        setLoading(false);
      } else {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const incoming = data.filter(m => !existingIds.has(m.id));
          return incoming.length ? [...prev, ...incoming] : prev;
        });
      }
    }

    fetchMessages(true);
    const interval = setInterval(() => fetchMessages(false), 3000);
    return () => clearInterval(interval);
  }, [leagueId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const content = text.trim();
    if (!content || !user || sending) return;
    setSending(true);
    setText("");
    const { data } = await supabase
      .from("league_messages")
      .insert({ league_id: leagueId, user_id: user.id, content })
      .select("id, content, created_at, user_id")
      .single();
    if (data) {
      // Optimistically add own message — don't wait for realtime
      setMessages(prev => [...prev, { ...data, profiles: { username: profile?.username, avatar_url: profile?.avatar_url } }]);
    }
    setSending(false);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48" style={{ color: "rgba(255,255,255,0.3)" }}>
      <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin mr-2" />
      <span className="text-sm">Loading chat…</span>
    </div>
  );

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", height: 420 }}>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
              No messages yet — be the first to say something!
            </p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.user_id === user?.id;
          const username = msg.profiles?.username ?? "Unknown";
          const avatar = msg.profiles?.avatar_url;
          const showAvatar = !isMe && (i === 0 || messages[i - 1].user_id !== msg.user_id);

          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              {/* Avatar — other users only, collapsed for consecutive messages */}
              {!isMe && (
                <div style={{ width: 28, flexShrink: 0 }}>
                  {showAvatar && (
                    avatar
                      ? <img src={avatar} alt={username} className="rounded-full object-cover" style={{ width: 28, height: 28 }} />
                      : <div className="rounded-full flex items-center justify-center font-bold text-xs"
                          style={{ width: 28, height: 28, background: "rgba(200,240,0,0.15)", color: "#c8f000" }}>
                          {username[0].toUpperCase()}
                        </div>
                  )}
                </div>
              )}

              <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[72%]`}>
                {showAvatar && !isMe && (
                  <p className="text-xs font-bold mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>{username}</p>
                )}
                <div className="px-3 py-2 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background: isMe ? "rgba(200,240,0,0.15)" : "rgba(255,255,255,0.07)",
                    color: isMe ? "#c8f000" : "rgba(255,255,255,0.85)",
                    borderBottomRightRadius: isMe ? 4 : undefined,
                    borderBottomLeftRadius:  !isMe ? 4 : undefined,
                  }}>
                  {msg.content}
                </div>
                <p className="text-xs mt-0.5 px-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3 shrink-0">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Send a message…"
          maxLength={500}
          className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
          style={{
            background: text.trim() ? "linear-gradient(135deg,#c8f000,#84cc16)" : "rgba(255,255,255,0.07)",
            opacity: sending ? 0.5 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={text.trim() ? "#1a0533" : "rgba(255,255,255,0.3)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── League Detail View ────────────────────────────────────────────────────────

function LeagueDetail({ league, mySubmissionId, onBack, onEnterBracket, onNavigate, onDelete, deleting }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("rankings");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Leagues
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.5rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>
              {league.name}
            </h2>
            {league.is_public && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000" }}>Public</span>
            )}
          </div>
          {league.description && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{league.description}</p>}
        </div>
      </div>

      {/* No bracket warning */}
      {!mySubmissionId && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl mb-5"
          style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
          <p className="text-sm" style={{ color: "#f97316" }}>You haven't entered a bracket in this league yet.</p>
          <button onClick={onEnterBracket}
            className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all active:scale-95"
            style={{ background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)" }}>
            Enter Bracket
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: "rankings", label: "Rankings" }, { id: "info", label: "League Info" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
            style={{
              background: tab === t.id ? "#c8f000" : "rgba(255,255,255,0.06)",
              color: tab === t.id ? "#1a0533" : "rgba(255,255,255,0.5)",
              border: tab === t.id ? "none" : "1px solid rgba(255,255,255,0.1)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rankings" && <LeagueRankings leagueId={league.id} />}

      {tab === "info" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl px-5 py-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Join Code</p>
            <p className="font-black text-2xl tracking-[0.2em]" style={{ color: "#c8f000", fontFamily: "'Bebas Neue',sans-serif" }}>{league.join_code}</p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>Share this code so others can join</p>
          </div>
          <div className="rounded-xl px-5 py-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Visibility</p>
            <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>{league.is_public ? "Public — visible to all" : "Private — invite only"}</p>
          </div>

          {user?.id === league.creator_id && (
            <div className="mt-2">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{ background: "rgba(239,68,68,0.07)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                  Delete League
                </button>
              ) : (
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <p className="text-sm font-semibold mb-3" style={{ color: "#ef4444" }}>
                    Delete <strong>{league.name}</strong>? This cannot be undone. All members will be removed.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={onDelete} disabled={deleting}
                      className="flex-1 py-2 rounded-lg text-sm font-black transition-all active:scale-95"
                      style={{ background: deleting ? "rgba(239,68,68,0.3)" : "#ef4444", color: "white" }}>
                      {deleting ? "Deleting…" : "Yes, Delete"}
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 rounded-lg text-sm font-bold"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Leagues Page ─────────────────────────────────────────────────────────

export default function Leagues({ onNavigate, initialLeagueCtx = null }) {
  const { user } = useAuth();
  const [myLeagues, setMyLeagues] = useState([]);
  const [publicLeagues, setPublicLeagues] = useState([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [bracketLeague, setBracketLeague] = useState(null);
  // If navigated from Home with a specific league, pre-select it
  const [selectedLeague, setSelectedLeague] = useState(
    initialLeagueCtx ? { id: initialLeagueCtx.leagueId, name: initialLeagueCtx.leagueName } : null
  );
  const [deletingLeague, setDeletingLeague] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPublic, setCreatePublic] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  function loadMyLeagues() {
    if (!user) return;
    setLoadingMine(true);
    supabase
      .from("league_members")
      .select("league_id, submission_id, leagues(id, name, description, join_code, is_public, creator_id)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setMyLeagues((data ?? []).map(r => ({ ...r.leagues, submission_id: r.submission_id })).filter(Boolean));
        setLoadingMine(false);
      });
  }

  function loadPublicLeagues() {
    setLoadingPublic(true);
    supabase
      .from("leagues")
      .select("id, name, description, join_code, creator_id")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => { setPublicLeagues(data ?? []); setLoadingPublic(false); });
  }

  useEffect(() => { loadMyLeagues(); loadPublicLeagues(); }, [user]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateLoading(true);
    setCreateError(null);
    const code = generateJoinCode();
    await supabase.from("leagues").insert({
      name: createName.trim(),
      description: createDesc.trim() || null,
      creator_id: user.id,
      join_code: code,
      is_public: createPublic,
    }).select("id").single().then(async ({ data, error }) => {
      if (error) { setCreateError(error.message); setCreateLoading(false); return; }
      await supabase.from("league_members").insert({ league_id: data.id, user_id: user.id });
      setCreateLoading(false);
      setShowCreate(false);
      setCreateName(""); setCreateDesc(""); setCreatePublic(false);
      loadMyLeagues(); loadPublicLeagues();
      setBracketLeague({ id: data.id, name: createName.trim() });
    });
  }

  async function handleJoin(e) {
    e.preventDefault();
    setJoinLoading(true);
    setJoinError(null);
    const { data: league, error: findError } = await supabase
      .from("leagues").select("id, name").eq("join_code", joinCode.trim().toUpperCase()).maybeSingle();
    if (findError || !league) { setJoinError("League not found. Check the code and try again."); setJoinLoading(false); return; }
    const { error } = await supabase.from("league_members").insert({ league_id: league.id, user_id: user.id });
    setJoinLoading(false);
    if (error?.code === "23505") { setJoinError("You're already in this league."); return; }
    if (error) { setJoinError(error.message); return; }
    setShowJoin(false); setJoinCode("");
    loadMyLeagues();
    setBracketLeague({ id: league.id, name: league.name });
  }

  async function handleJoinPublic(league) {
    await supabase.from("league_members").insert({ league_id: league.id, user_id: user.id });
    loadMyLeagues();
    setBracketLeague({ id: league.id, name: league.name });
  }

  const myLeagueIds = new Set(myLeagues.map(l => l.id));

  async function handleDeleteLeague() {
    setDeletingLeague(true);
    await supabase.from("leagues").delete().eq("id", selectedLeague.id);
    setDeletingLeague(false);
    setSelectedLeague(null);
    loadMyLeagues();
    loadPublicLeagues();
  }

  // ── League detail drill-down ──────────────────────────────────────────────
  if (selectedLeague) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <LeagueDetail
          league={selectedLeague}
          mySubmissionId={selectedLeague.submission_id}
          onBack={() => { setSelectedLeague(null); loadMyLeagues(); }}
          onEnterBracket={() => setBracketLeague({ id: selectedLeague.id, name: selectedLeague.name })}
          onNavigate={onNavigate}
          onDelete={handleDeleteLeague}
          deleting={deletingLeague}
        />
        {bracketLeague && (
          <BracketPickerModal
            leagueId={bracketLeague.id}
            leagueName={bracketLeague.name}
            onClose={() => {
              setBracketLeague(null);
              loadMyLeagues();
              // Refresh submission_id on selectedLeague
              supabase.from("league_members").select("submission_id").eq("league_id", selectedLeague.id).eq("user_id", user.id).maybeSingle()
                .then(({ data }) => setSelectedLeague(l => ({ ...l, submission_id: data?.submission_id ?? null })));
            }}
            onNavigate={onNavigate}
          />
        )}
      </div>
    );
  }

  // ── League list ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Social</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>Leagues</h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Compete with friends in private or public leagues</p>
      </div>

      {user && (
        <div className="flex gap-3 mb-8">
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
            + Create League
          </button>
          <button onClick={() => setShowJoin(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}>
            Join with Code
          </button>
        </div>
      )}

      {/* My Leagues */}
      <section className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>My Leagues</h2>
        {loadingMine ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
        ) : myLeagues.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>You haven't joined any leagues yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myLeagues.map(league => (
              <button key={league.id} onClick={() => setSelectedLeague(league)}
                className="w-full text-left rounded-xl px-5 py-4 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold" style={{ color: "white" }}>{league.name}</p>
                      {league.is_public && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000" }}>Public</span>}
                      {!league.submission_id && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}>No bracket</span>}
                    </div>
                    {league.description && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{league.description}</p>}
                    <p className="text-xs mt-1 font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>Code: {league.join_code}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Public Leagues */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>Browse Public Leagues</h2>
        {loadingPublic ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
        ) : publicLeagues.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No public leagues yet. Be the first to create one!</p>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            {publicLeagues.map((league, i) => {
              const alreadyIn = myLeagueIds.has(league.id);
              return (
                <div key={league.id} className="px-5 py-4 flex items-center justify-between gap-4"
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div>
                    <p className="font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{league.name}</p>
                    {league.description && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{league.description}</p>}
                  </div>
                  {user && (
                    alreadyIn ? (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>Joined</span>
                    ) : (
                      <button onClick={() => handleJoinPublic(league)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all active:scale-95"
                        style={{ background: "rgba(200,240,0,0.1)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}>
                        Join
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Create a League" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>League Name</label>
              <input style={inputStyle} required placeholder="e.g. Office Champions" value={createName} onChange={e => setCreateName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Description (optional)</label>
              <input style={inputStyle} placeholder="A brief description…" value={createDesc} onChange={e => setCreateDesc(e.target.value)} />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setCreatePublic(p => !p)}
                className="w-10 h-5 rounded-full transition-all relative shrink-0"
                style={{ background: createPublic ? "#c8f000" : "rgba(255,255,255,0.15)" }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow"
                  style={{ left: createPublic ? "calc(100% - 18px)" : "2px" }} />
              </div>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Public league (browsable by anyone)</span>
            </label>
            {createError && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{createError}</p>}
            <button type="submit" disabled={createLoading}
              className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 mt-1"
              style={{ background: createLoading ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
              {createLoading ? "Creating…" : "Create League"}
            </button>
          </form>
        </Modal>
      )}

      {/* Join Modal */}
      {showJoin && (
        <Modal title="Join a League" onClose={() => { setShowJoin(false); setJoinCode(""); setJoinError(null); }}>
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Enter Join Code</label>
              <input style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "0.15em", fontSize: "1rem", fontWeight: 700 }}
                required placeholder="ABC123" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value)} />
            </div>
            {joinError && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{joinError}</p>}
            <button type="submit" disabled={joinLoading}
              className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95"
              style={{ background: joinLoading ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
              {joinLoading ? "Joining…" : "Join League"}
            </button>
          </form>
        </Modal>
      )}

      {/* Bracket Picker Modal */}
      {bracketLeague && (
        <BracketPickerModal
          leagueId={bracketLeague.id}
          leagueName={bracketLeague.name}
          onClose={() => { setBracketLeague(null); loadMyLeagues(); loadPublicLeagues(); }}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
