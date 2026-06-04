import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

export default function InviteRedirect({ token, onNavigate, onSignUp }) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState("loading"); // loading | valid | invalid | done | already
  const [creatorName, setCreatorName] = useState(null);

  // Resolve the token
  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    supabase
      .from("friend_invites")
      .select("id, creator_id, expires_at, profiles(username)")
      .eq("token", token)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setStatus("invalid"); return; }
        if (new Date(data.expires_at) < new Date()) { setStatus("invalid"); return; }
        setCreatorName(data.profiles?.username ?? "Someone");
        setStatus("valid");
      });
  }, [token]);

  // Once user is logged in and invite is valid, complete the friendship
  useEffect(() => {
    if (status !== "valid" || authLoading || !user) return;
    async function complete() {
      const invite = await supabase
        .from("friend_invites")
        .select("creator_id")
        .eq("token", token)
        .maybeSingle();
      if (!invite.data) { setStatus("invalid"); return; }
      const creatorId = invite.data.creator_id;
      if (creatorId === user.id) { setStatus("done"); return; } // can't friend yourself
      // Insert accepted friendship — handle duplicates gracefully
      const { error } = await supabase.from("friendships").insert({
        requester_id: creatorId,
        addressee_id: user.id,
        status: "accepted",
      });
      if (error?.code === "23505") { setStatus("already"); return; }
      setStatus("done");
    }
    complete();
  }, [status, user, authLoading]);

  const containerStyle = {
    minHeight: "60vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
  };

  if (status === "loading" || (status === "valid" && (authLoading || user))) {
    return (
      <div style={containerStyle}>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Processing invite…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div style={containerStyle}>
        <div className="text-4xl mb-4">🔗</div>
        <p className="font-bold text-white mb-1">Invalid or Expired Link</p>
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>This invite link has expired or doesn't exist.</p>
        <button onClick={() => onNavigate("groups")}
          className="px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}>
          Go to Home
        </button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div style={containerStyle}>
        <div className="text-4xl mb-4">🤝</div>
        <p className="font-bold text-white mb-1">You're now friends with {creatorName}!</p>
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>Head to the leaderboard to compete.</p>
        <button onClick={() => onNavigate("leaderboard")}
          className="px-5 py-2.5 rounded-xl text-sm font-black"
          style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
          View Leaderboard
        </button>
      </div>
    );
  }

  if (status === "already") {
    return (
      <div style={containerStyle}>
        <div className="text-4xl mb-4">👍</div>
        <p className="font-bold text-white mb-1">Already friends with {creatorName}</p>
        <button onClick={() => onNavigate("leaderboard")}
          className="px-5 py-2.5 mt-4 rounded-xl text-sm font-black"
          style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
          View Leaderboard
        </button>
      </div>
    );
  }

  // valid + not logged in → prompt to sign up
  return (
    <div style={containerStyle}>
      <div className="text-4xl mb-4">🏆</div>
      <p className="font-bold text-white mb-1">{creatorName} invited you to compete!</p>
      <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>Sign up to accept the invite and join the leaderboard.</p>
      <button onClick={onSignUp}
        className="px-5 py-2.5 rounded-xl text-sm font-black"
        style={{ background: "linear-gradient(135deg,#c8f000,#84cc16)", color: "#1a0533" }}>
        Sign Up to Accept
      </button>
    </div>
  );
}
