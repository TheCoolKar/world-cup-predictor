/**
 * Profile.jsx — user account settings
 * Edit display name, view email, send password reset.
 */

import { useState } from "react";
import { useAuth }  from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { getPicks, getBracket } from "../utils/storage";

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "11px 14px",
  color: "white",
  fontSize: "0.875rem",
  outline: "none",
};

function StatPill({ label, value, accent = "#c8f000" }) {
  return (
    <div
      className="flex flex-col items-center px-5 py-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", color: accent, lineHeight: 1 }}>
        {value}
      </span>
      <span className="text-xs mt-1 font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
        {label}
      </span>
    </div>
  );
}

export default function Profile({ onNavigate }) {
  const { user, signOut } = useAuth();

  const [name,       setName]       = useState(user?.user_metadata?.display_name ?? "");
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [saveError,  setSaveError]  = useState(null);
  const [resetSent,  setResetSent]  = useState(false);
  const [resetError, setResetError] = useState(null);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <span style={{ fontSize: "3rem" }}>🔒</span>
        <h2 className="text-white mt-4 mb-2"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.06em" }}>
          Sign In to View Your Profile
        </h2>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
          Your picks are saved locally. Create an account to sync them to the cloud.
        </p>
      </div>
    );
  }

  const initial    = (name || user.email || "?")[0].toUpperCase();
  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";

  const picks        = getPicks();
  const bracket      = getBracket();
  const groupPicks   = Object.keys(picks).length;
  const bracketPicks = bracket
    ? ["R32","R16","QF","SF","F"].reduce((s, r) => s + (bracket[r]?.filter(Boolean).length ?? 0), 0)
      + (bracket["3P"]?.[0] ? 1 : 0)
    : 0;
  const champion = bracket?.F?.[0] ?? null;

  async function handleSaveName(e) {
    e.preventDefault();
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    setResetError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin,
    });
    if (error) setResetError(error.message);
    else setResetSent(true);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Account</p>
        <h2 className="text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.06em" }}>
          My Profile
        </h2>
      </div>

      {/* ── Avatar + quick stats ── */}
      <div className="flex items-center gap-5 mb-8 flex-wrap">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center font-black shrink-0"
          style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533", fontSize: "2rem" }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-black text-lg truncate">{name || "—"}</h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{user.email}</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>Member since {joinedDate}</p>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatPill label="Group picks" value={`${groupPicks}/72`} accent="#c8f000" />
        <StatPill label="Bracket picks" value={`${bracketPicks}/32`} accent="#c8f000" />
        <StatPill
          label="Champion"
          value={champion ? "✓" : "—"}
          accent={champion ? "#22c55e" : "rgba(255,255,255,0.2)"}
        />
      </div>

      {/* ── Edit display name ── */}
      <section
        className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <h4 className="font-black text-white mb-1">Display Name</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
          This is how your name appears on the leaderboard.
        </p>

        <form onSubmit={handleSaveName} className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            maxLength={40}
            required
            style={{ ...inputStyle, flex: 1 }}
            onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.5)"}
            onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 shrink-0"
            style={{
              background: saved ? "rgba(34,197,94,0.2)" : saving ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg,#c8f000,#84cc16)",
              color: saved ? "#22c55e" : saving ? "rgba(255,255,255,0.5)" : "#1a0533",
              border: saved ? "1px solid rgba(34,197,94,0.4)" : "none",
            }}
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save"}
          </button>
        </form>

        {saveError && (
          <p className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            {saveError}
          </p>
        )}
      </section>

      {/* ── Email (read-only) ── */}
      <section
        className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <h4 className="font-black text-white mb-1">Email Address</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
          Your email cannot be changed here. Contact support if needed.
        </p>
        <div style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}>
          {user.email}
        </div>
      </section>

      {/* ── Password reset ── */}
      <section
        className="rounded-2xl p-6 mb-8"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <h4 className="font-black text-white mb-1">Password</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
          We'll send a reset link to <strong style={{ color: "rgba(255,255,255,0.6)" }}>{user.email}</strong>.
        </p>

        {resetSent ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <span>📬</span>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Reset link sent — check your inbox.</p>
          </div>
        ) : (
          <button
            onClick={handlePasswordReset}
            className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
          >
            Send Password Reset Email
          </button>
        )}

        {resetError && (
          <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{resetError}</p>
        )}
      </section>

      {/* ── Danger zone ── */}
      <section
        className="rounded-2xl p-6"
        style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}
      >
        <h4 className="font-black mb-1" style={{ color: "#ef4444" }}>Sign Out</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
          Your local picks will remain on this device.
        </p>
        <button
          onClick={signOut}
          className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
        >
          Sign Out
        </button>
      </section>

    </div>
  );
}
