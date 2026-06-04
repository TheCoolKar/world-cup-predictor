import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { generateJoinCode } from "../utils/social";

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

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "10px 14px", color: "white", fontSize: "0.875rem", outline: "none",
};

export default function Leagues({ onNavigate }) {
  const { user } = useAuth();
  const [myLeagues, setMyLeagues] = useState([]);
  const [publicLeagues, setPublicLeagues] = useState([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
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
      .select("league_id, leagues(id, name, description, join_code, is_public, creator_id)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setMyLeagues((data ?? []).map(r => r.leagues).filter(Boolean));
        setLoadingMine(false);
      });
  }

  function loadPublicLeagues() {
    setLoadingPublic(true);
    supabase
      .from("leagues")
      .select("id, name, description, join_code, creator_id, profiles(username)")
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
    const { error } = await supabase.from("leagues").insert({
      name: createName.trim(),
      description: createDesc.trim() || null,
      creator_id: user.id,
      join_code: code,
      is_public: createPublic,
    }).select("id").single().then(async ({ data, error }) => {
      if (error) return { error };
      await supabase.from("league_members").insert({ league_id: data.id, user_id: user.id });
      return { error: null };
    });
    setCreateLoading(false);
    if (error) { setCreateError(error.message); return; }
    setShowCreate(false);
    setCreateName(""); setCreateDesc(""); setCreatePublic(false);
    loadMyLeagues(); loadPublicLeagues();
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
  }

  async function handleJoinPublic(leagueId) {
    await supabase.from("league_members").insert({ league_id: leagueId, user_id: user.id });
    loadMyLeagues();
  }

  const myLeagueIds = new Set(myLeagues.map(l => l.id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Social</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: "white", letterSpacing: "0.04em", lineHeight: 1 }}>Leagues</h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Compete with friends in private or public leagues</p>
      </div>

      {/* Action buttons */}
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
              <div key={league.id} className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold" style={{ color: "white" }}>{league.name}</p>
                    {league.is_public && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000" }}>Public</span>}
                  </div>
                  {league.description && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{league.description}</p>}
                  <p className="text-xs mt-1 font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>Code: {league.join_code}</p>
                </div>
                <button onClick={() => onNavigate("leaderboard")}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all"
                  style={{ background: "rgba(200,240,0,0.1)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}>
                  View Rankings
                </button>
              </div>
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
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>by {league.profiles?.username ?? "—"}</p>
                  </div>
                  {user && (
                    alreadyIn ? (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>Joined</span>
                    ) : (
                      <button onClick={() => handleJoinPublic(league.id)}
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
    </div>
  );
}
