import { useState, useEffect, useRef } from "react";
import { useAuth }  from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { getPicks, getBracket } from "../utils/storage";
import FriendsPanel from "../components/FriendsPanel";

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

function usernameValid(u) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

function StatPill({ label, value, accent = "#c8f000" }) {
  return (
    <div className="flex flex-col items-center px-5 py-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", color: accent, lineHeight: 1 }}>{value}</span>
      <span className="text-xs mt-1 font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</span>
    </div>
  );
}

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth();

  const [name,         setName]         = useState("");
  const [username,     setUsername]     = useState("");
  const [usernameState,setUsernameState]= useState("idle"); // idle|checking|taken|available|unchanged
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [saveError,    setSaveError]    = useState(null);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError,     setAvatarError]     = useState(null);
  const fileInputRef = useRef(null);
  const debounceRef  = useRef(null);

  useEffect(() => {
    if (user) setName(user.user_metadata?.display_name ?? "");
    if (profile) setUsername(profile.username ?? "");
  }, [user, profile]);

  // Live uniqueness check
  useEffect(() => {
    // If profile exists and username hasn't changed, no need to check
    if (profile && username === profile.username) { setUsernameState("unchanged"); return; }
    if (!username) { setUsernameState("idle"); return; }
    if (!usernameValid(username)) { setUsernameState("idle"); return; }

    setUsernameState("checking");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      setUsernameState(data ? "taken" : "available");
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [username, profile]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <span style={{ fontSize: "3rem" }}>🔒</span>
        <h2 className="text-white mt-4 mb-2"
          style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2rem", letterSpacing: "0.06em" }}>
          Sign In to View Your Profile
        </h2>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.7)" }}>
          Your picks are saved locally. Create an account to sync them to the cloud.
        </p>
      </div>
    );
  }

  const avatarUrl  = profile?.avatar_url ?? null;
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

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setAvatarError("Image must be under 2 MB."); return; }

    setAvatarUploading(true);
    setAvatarError(null);

    try {
      const ext  = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl + `?t=${Date.now()}`, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (dbErr) throw dbErr;

      await refreshProfile();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setSaveError(null); setSaved(false);

    try {
      // Update display name
      const { error: authErr } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      if (authErr) throw authErr;

      // Upsert profile row (handles both new users and existing ones)
      if (usernameState === "available") {
        const { error: profErr } = await supabase
          .from("profiles")
          .upsert({ id: user.id, username: username.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (profErr) throw profErr;
        await refreshProfile();
      }

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

  const usernameBorderColor =
    usernameState === "available"  ? "rgba(200,240,0,0.6)"  :
    usernameState === "taken"      ? "rgba(239,68,68,0.6)"  :
    usernameState === "checking"   ? "rgba(255,255,255,0.3)" :
    "rgba(255,255,255,0.12)";

  const usernameHint =
    usernameState === "checking"  ? { text: "Checking…",      color: "rgba(255,255,255,0.6)" } :
    usernameState === "available" ? { text: "✓ Available",    color: "#c8f000" } :
    usernameState === "taken"     ? { text: "✗ Already taken", color: "#ef4444" } :
    username && !usernameValid(username)
      ? { text: "3–20 chars, letters/numbers/underscore only", color: "rgba(255,255,255,0.6)" }
      : null;

  const usernameOk = usernameState === "unchanged" || usernameState === "available" ||
    (usernameState === "idle" && username === (profile?.username ?? ""));
  const canSave = name.trim() && usernameOk && usernameState !== "taken";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Account</p>
        <h2 className="text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.06em" }}>
          My Profile
        </h2>
      </div>

      {/* Avatar + info */}
      <div className="flex items-center gap-5 mb-8 flex-wrap">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div
            className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center font-black"
            style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533", fontSize: "2rem" }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              : initial
            }
          </div>
          {/* Upload button overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all"
            style={{
              background: avatarUploading ? "rgba(255,255,255,0.2)" : "#c8f000",
              color: "#1a0533",
              fontSize: "0.7rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              border: "2px solid #1a0533",
            }}
            title="Change profile picture"
          >
            {avatarUploading ? (
              <span className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(0,0,0,0.3)", borderTopColor: "transparent" }} />
            ) : "✎"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-white font-black text-lg truncate">{name || "—"}</h3>
          {profile?.username && (
            <p className="text-xs font-semibold mt-0.5" style={{ color: "#c8f000" }}>@{profile.username}</p>
          )}
          <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{user.email}</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>Member since {joinedDate}</p>
        </div>
      </div>

      {avatarError && (
        <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          {avatarError}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatPill label="Group picks"   value={`${groupPicks}/48`}  accent="#c8f000" />
        <StatPill label="Bracket picks" value={`${bracketPicks}/32`} accent="#c8f000" />
        <StatPill label="Champion" value={champion ? "✓" : "—"} accent={champion ? "#22c55e" : "rgba(255,255,255,0.2)"} />
      </div>

      {/* Edit name + username */}
      <section className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h4 className="font-black text-white mb-1">Display Name & Username</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
          Your display name appears on the leaderboard. Your username is unique and public.
        </p>
        {!profile && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4"
            style={{ background: "rgba(200,240,0,0.07)", border: "1px solid rgba(200,240,0,0.2)" }}>
            <span style={{ color: "#c8f000", fontSize: "0.75rem" }}>⚡</span>
            <p className="text-xs font-semibold" style={{ color: "#c8f000" }}>
              Choose a username to complete your profile setup.
            </p>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Display Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" maxLength={40} required
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.5)"}
              onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.12)"} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              Username <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>(unique, public)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                style={{ color: "rgba(255,255,255,0.6)" }}>@</span>
              <input type="text" value={username} onChange={e => setUsername(e.target.value.replace(/\s/g, ""))}
                placeholder="your_username" maxLength={20} required
                style={{ ...inputStyle, paddingLeft: 28, borderColor: usernameBorderColor }}
                onFocus={e => e.target.style.borderColor = usernameBorderColor}
                onBlur={e  => e.target.style.borderColor = usernameBorderColor} />
            </div>
            {usernameHint && (
              <p className="text-xs mt-1" style={{ color: usernameHint.color }}>{usernameHint.text}</p>
            )}
          </div>

          {saveError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
              {saveError}
            </p>
          )}

          <button type="submit" disabled={saving || !canSave}
            className="self-start px-6 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
            style={{
              background: saved ? "rgba(34,197,94,0.2)" : saving ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg,#c8f000,#84cc16)",
              color: saved ? "#22c55e" : saving ? "rgba(255,255,255,0.5)" : "#1a0533",
              border: saved ? "1px solid rgba(34,197,94,0.4)" : "none",
              opacity: !canSave ? 0.5 : 1,
              cursor: !canSave ? "not-allowed" : "pointer",
            }}>
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </section>

      {/* Email (read-only) */}
      <section className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h4 className="font-black text-white mb-1">Email Address</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
          Your email cannot be changed here.
        </p>
        <div style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}>{user.email}</div>
      </section>

      {/* Password reset */}
      <section className="rounded-2xl p-6 mb-8"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h4 className="font-black text-white mb-1">Password</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
          We'll send a reset link to <strong style={{ color: "rgba(255,255,255,0.6)" }}>{user.email}</strong>.
        </p>
        {resetSent ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <span>📬</span>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Reset link sent — check your inbox.</p>
          </div>
        ) : (
          <button onClick={handlePasswordReset}
            className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}>
            Send Password Reset Email
          </button>
        )}
        {resetError && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{resetError}</p>}
      </section>

      {/* Sign out */}
      <section className="rounded-2xl p-6"
        style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <h4 className="font-black mb-1" style={{ color: "#ef4444" }}>Sign Out</h4>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>Your local picks will remain on this device.</p>
        <button onClick={signOut}
          className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.18)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.1)"}>
          Sign Out
        </button>
      </section>

      <FriendsPanel />

    </div>
  );
}
