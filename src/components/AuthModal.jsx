import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthModal({ onClose, onAuth, initialMode = "login" }) {
  const [mode,     setMode]     = useState(initialMode); // "login" | "signup" | "magic"
  const [email,    setEmail]    = useState("");
  const [name,     setName]     = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [sent,     setSent]     = useState(false);

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
