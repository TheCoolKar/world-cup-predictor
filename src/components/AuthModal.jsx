import { useState } from "react";
import { supabase } from "../lib/supabase";

// Add a provider here only after enabling it in Supabase Dashboard → Authentication → Providers
// and completing the OAuth app setup with the provider (Google Cloud, Azure, Apple Developer).
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
  // Apple requires an Apple Developer account + App ID + Service ID + private key.
  // Uncomment once configured in Supabase Dashboard → Authentication → Providers → Apple.
  // {
  //   id: "apple",
  //   label: "Apple",
  //   icon: (
  //     <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
  //       <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.36.74 3.19.8 1.21-.24 2.39-.93 3.68-.84 1.58.13 2.77.76 3.55 1.96-3.26 1.95-2.5 5.9.63 7.04-.58 1.59-1.35 3.16-3.05 3.92zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  //     </svg>
  //   ),
  // },
  // Microsoft requires an Azure app registration with a client ID + secret.
  // Uncomment once configured in Supabase Dashboard → Authentication → Providers → Azure.
  // {
  //   id: "azure",
  //   label: "Microsoft",
  //   icon: (
  //     <svg viewBox="0 0 24 24" width="18" height="18">
  //       <path fill="#f25022" d="M1 1h10v10H1z"/>
  //       <path fill="#7fba00" d="M13 1h10v10H13z"/>
  //       <path fill="#00a4ef" d="M1 13h10v10H1z"/>
  //       <path fill="#ffb900" d="M13 13h10v10H13z"/>
  //     </svg>
  //   ),
  // },
];

export default function AuthModal({ onClose, onAuth, initialMode = "login" }) {
  const [mode,        setMode]        = useState(initialMode); // "login" | "signup" | "magic"
  const [email,       setEmail]       = useState("");
  const [name,        setName]        = useState("");
  const [password,    setPassword]    = useState("");
  const [loading,     setLoading]     = useState(false);
  const [oauthLoading,setOauthLoading]= useState(null); // provider id while redirecting
  const [error,       setError]       = useState(null);
  const [sent,        setSent]        = useState(false);

  async function handleOAuth(provider) {
    setError(null);
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Browser will redirect — no further action needed here
    } catch (err) {
      setError(err.message);
      setOauthLoading(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
        setSent(true);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } },
        });
        if (error) throw error;
        if (data.user) onAuth(data.user, name);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) onAuth(data.user, data.user.user_metadata?.display_name ?? "");
      }
    } catch (err) {
      setError(err.message);
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
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
        >✕</button>

        {/* Title */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#ef4444" }}>
            {mode === "signup" ? "Create Account" : "Sign In"}
          </p>
          <h3
            className="text-white leading-none"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", letterSpacing: "0.04em" }}
          >
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
              We sent a magic link to <strong style={{ color: "#c8f000" }}>{email}</strong>.<br />
              Click it to sign in and your bracket will be saved automatically.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.4)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                Email
              </label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.4)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
              />
            </div>

            {mode !== "magic" && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "rgba(200,240,0,0.4)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
                />
              </div>
            )}

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-black text-sm transition-all duration-150 active:scale-95 mt-1"
              style={{
                background: loading ? "rgba(200,240,0,0.3)" : "linear-gradient(135deg, #c8f000, #84cc16)",
                color: "#1a0533",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Please wait…" : mode === "signup" ? "Create Account & Save" : mode === "magic" ? "Send Magic Link" : "Sign In & Save Bracket"}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mt-2">
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>or continue with</span>
              <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* ── OAuth buttons ── */}
            <div className="flex flex-col gap-2">
              {OAUTH_PROVIDERS.map((p) => {
                const isLoading = oauthLoading === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleOAuth(p.id)}
                    disabled={!!oauthLoading || loading}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 active:scale-95"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.11)",
                      color: isLoading ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.8)",
                      opacity: oauthLoading && !isLoading ? 0.45 : 1,
                      cursor: oauthLoading && !isLoading ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={e => { if (!oauthLoading) { e.currentTarget.style.background = "rgba(255,255,255,0.11)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.11)"; }}
                  >
                    {isLoading ? (
                      <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "transparent" }} />
                    ) : (
                      p.icon
                    )}
                    <span>{isLoading ? `Connecting to ${p.label}…` : `Continue with ${p.label}`}</span>
                  </button>
                );
              })}
            </div>
          </form>
        )}

        {/* Mode switcher */}
        {!sent && (
          <div className="mt-4 flex flex-col gap-1.5 items-center">
            {mode === "login" && (
              <>
                <button onClick={() => { setMode("signup"); setError(null); }}
                  className="text-xs transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}>
                  No account? Sign up →
                </button>
                <button onClick={() => { setMode("magic"); setError(null); }}
                  className="text-xs transition-colors"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}>
                  Or use a magic link (no password)
                </button>
              </>
            )}
            {mode === "signup" && (
              <button onClick={() => { setMode("login"); setError(null); }}
                className="text-xs transition-colors"
                style={{ color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => e.currentTarget.style.color = "#c8f000"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}>
                Already have an account? Sign in →
              </button>
            )}
            {mode === "magic" && (
              <button onClick={() => { setMode("login"); setError(null); }}
                className="text-xs transition-colors"
                style={{ color: "rgba(255,255,255,0.35)" }}
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
