import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

const OAUTH_PROVIDERS = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
];

function usernameValid(u) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

export default function AuthModal({ onClose, onAuth, initialMode = "login" }) {
  const [mode,         setMode]         = useState(initialMode);
  const [email,        setEmail]        = useState("");
  const [name,         setName]         = useState("");
  const [username,     setUsername]     = useState("");
  const [usernameState,setUsernameState]= useState("idle"); // "idle"|"checking"|"taken"|"available"
  const [password,     setPassword]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [error,        setError]        = useState(null);
  const [sent,         setSent]         = useState(false);
  const debounceRef = useRef(null);

  // Live username uniqueness check
  useEffect(() => {
    if (mode !== "signup") return;
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
  }, [username, mode]);

  async function handleOAuth(provider) {
    setError(null);
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      setOauthLoading(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && usernameState !== "available") {
      setError("Please choose a valid, available username.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
        setSent(true);

      } else if (mode === "signup") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: import.meta.env.VITE_APP_URL ?? window.location.origin,
            data: {
              display_name: name,
              username: username.toLowerCase(),
            },
          },
        });
        if (error) throw error;

        if (data.session) {
          onAuth(data.user);
        } else {
          setSent(true);
        }

      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) onAuth(data.user);
      }
    } catch (err) {
      // Surface username race-condition constraint violation as a friendly message
      if (err.message?.toLowerCase().includes("unique") || err.code === "23505") {
        setError("Username already taken — please choose another.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "white",
    fontSize: "0.875rem",
    outline: "none",
  };

  const usernameBorderColor =
    usernameState === "available" ? "rgba(200,240,0,0.6)" :
    usernameState === "taken"     ? "rgba(239,68,68,0.6)" :
    usernameState === "checking"  ? "rgba(255,255,255,0.3)" :
    "rgba(255,255,255,0.12)";

  const usernameHint =
    usernameState === "checking"  ? { text: "Checking…",   color: "rgba(255,255,255,0.3)" } :
    usernameState === "available" ? { text: "✓ Available", color: "#c8f000" } :
    usernameState === "taken"     ? { text: "✗ Already taken", color: "#ef4444" } :
    username && !usernameValid(username)
      ? { text: "3–20 chars, letters/numbers/underscore only", color: "rgba(255,255,255,0.3)" }
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,2,26,0.92)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-8"
        style={{
          background: "linear-gradient(160deg, #1f0645 0%, #160336 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
        >✕</button>

        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#ef4444" }}>
            {mode === "signup" ? "Create Account" : "Sign In"}
          </p>
          <h3 className="text-white leading-none"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", letterSpacing: "0.04em" }}>
            {mode === "magic" ? "Magic Link Login" : mode === "signup" ? "Join the Challenge" : "Save Your Bracket"}
          </h3>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            Your picks are saved locally. Sign in to lock in your official submission.
          </p>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">📬</div>
            <p className="font-bold text-white mb-1">Check your email</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              {mode === "signup"
                ? <>We sent a verification link to <strong style={{ color: "#c8f000" }}>{email}</strong>.<br />Click it to confirm your account and you'll be signed in automatically.</>
                : <>We sent a magic link to <strong style={{ color: "#c8f000" }}>{email}</strong>.<br />Click it to sign in and your bracket will be saved automatically.</>
              }
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">

            {/* OAuth */}
            <div className="flex flex-col gap-2 mb-1">
              {OAUTH_PROVIDERS.map((p) => {
                const isLoading = oauthLoading === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => handleOAuth(p.id)}
                    disabled={!!oauthLoading || loading}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.11)",
                      color: isLoading ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.8)",
                    }}
                    onMouseEnter={e => { if (!oauthLoading) { e.currentTarget.style.background = "rgba(255,255,255,0.11)"; }}}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  >
                    {isLoading
                      ? <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "transparent" }} />
                      : p.icon}
                    <span>{isLoading ? `Connecting…` : `Continue with ${p.label}`}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>or</span>
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* Name (signup only) */}
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Display Name</label>
                <input type="text" required placeholder="e.g. Karim Assaad" value={name}
                  onChange={e => setName(e.target.value)} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.4)"}
                  onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.12)"} />
              </div>
            )}

            {/* Username (signup only) */}
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Username <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>(unique, public)</span>
                </label>
                <input type="text" required placeholder="e.g. karim_wc26" value={username}
                  onChange={e => setUsername(e.target.value.replace(/\s/g, ""))}
                  maxLength={20}
                  style={{ ...inputStyle, borderColor: usernameBorderColor }}
                  onFocus={e => e.target.style.borderColor = usernameBorderColor}
                  onBlur={e  => e.target.style.borderColor = usernameBorderColor} />
                {usernameHint && (
                  <p className="text-xs mt-1" style={{ color: usernameHint.color }}>{usernameHint.text}</p>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Email</label>
              <input type="email" required placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} style={inputStyle}
                onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.4)"}
                onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.12)"} />
            </div>

            {/* Password */}
            {mode !== "magic" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>Password</label>
                <input type="password" required placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.4)"}
                  onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.12)"} />
              </div>
            )}

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || (mode === "signup" && usernameState !== "available")}
              className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 mt-1"
              style={{
                background: loading ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg,#c8f000,#84cc16)",
                color: "#1a0533",
                opacity: loading || (mode === "signup" && usernameState !== "available") ? 0.6 : 1,
                cursor: mode === "signup" && usernameState !== "available" ? "not-allowed" : "pointer",
              }}>
              {loading ? "Please wait…" : mode === "signup" ? "Create Account & Save" : mode === "magic" ? "Send Magic Link" : "Sign In & Save Bracket"}
            </button>
          </form>
        )}

        {!sent && (
          <div className="mt-4 flex flex-col gap-1.5 items-center">
            {mode === "login" && (
              <>
                <button onClick={() => { setMode("signup"); setError(null); }}
                  className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.35)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}>
                  No account? Sign up →
                </button>
                <button onClick={() => { setMode("magic"); setError(null); }}
                  className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.25)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}>
                  Or use a magic link (no password)
                </button>
              </>
            )}
            {mode === "signup" && (
              <button onClick={() => { setMode("login"); setError(null); }}
                className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}>
                Already have an account? Sign in →
              </button>
            )}
            {mode === "magic" && (
              <button onClick={() => { setMode("login"); setError(null); }}
                className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}>
                ← Use email + password instead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
