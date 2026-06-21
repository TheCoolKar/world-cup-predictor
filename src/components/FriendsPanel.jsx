import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { generateInviteToken } from "../utils/social";
import { trackActivityEvent } from "../hooks/useActivityTracking";

function Avatar({ url, username, size = 30 }) {
  if (url) return <img src={url} alt={username} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, background: "rgba(200,240,0,0.15)", color: "#c8f000", fontSize: size * 0.38 }}>
      {username?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default function FriendsPanel() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const debounceRef = useRef(null);

  function loadFriendships() {
    if (!user) return;
    supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id,username,avatar_url), addressee:profiles!friendships_addressee_id_fkey(id,username,avatar_url)")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .then(({ data }) => {
        const rows = data ?? [];
        setFriends(rows.filter(r => r.status === "accepted").map(r => ({
          id: r.id,
          profile: r.requester_id === user.id ? r.addressee : r.requester,
        })));
        setIncoming(rows.filter(r => r.status === "pending" && r.addressee_id === user.id).map(r => ({ id: r.id, profile: r.requester })));
        setOutgoing(rows.filter(r => r.status === "pending" && r.requester_id === user.id).map(r => ({ id: r.id, profile: r.addressee })));
      });
  }

  useEffect(() => { loadFriendships(); }, [user]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${searchQuery.trim()}%`)
        .neq("id", user.id)
        .limit(8);
      setSearchResults(data ?? []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  async function sendRequest(addresseeId) {
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: addresseeId });
    if (!error) trackActivityEvent("friend_request_sent");
    loadFriendships();
    setSearchQuery("");
    setSearchResults([]);
  }

  async function respond(friendshipId, status) {
    await supabase.from("friendships").update({ status }).eq("id", friendshipId);
    loadFriendships();
  }

  async function removeFriend(friendshipId) {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    loadFriendships();
  }

  async function generateInvite() {
    const token = generateInviteToken();
    const { error } = await supabase.from("friend_invites").insert({ token, creator_id: user.id });
    if (!error) {
      const url = `${window.location.origin}/invite/${token}`;
      setInviteUrl(url);
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  const knownIds = new Set([
    ...friends.map(f => f.profile?.id),
    ...incoming.map(f => f.profile?.id),
    ...outgoing.map(f => f.profile?.id),
  ]);

  const sectionLabel = (text) => (
    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>{text}</p>
  );

  return (
    <div className="mt-10 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#c8f000" }}>Social</p>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", color: "white", letterSpacing: "0.04em", lineHeight: 1, marginBottom: 20 }}>Friends</h2>

      {/* Search */}
      <div className="mb-6">
        {sectionLabel("Find Players")}
        <input
          placeholder="Search by username…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "white", fontSize: "0.875rem", outline: "none" }}
        />
        {searching && <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.6)" }}>Searching…</p>}
        {searchResults.length > 0 && (
          <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {searchResults.map((p, i) => {
              const alreadyFriend = knownIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3"
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", background: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center gap-2.5">
                    <Avatar url={p.avatar_url} username={p.username} />
                    <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{p.username}</span>
                  </div>
                  {alreadyFriend ? (
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>Already connected</span>
                  ) : (
                    <button onClick={() => sendRequest(p.id)}
                      className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
                      style={{ background: "rgba(200,240,0,0.12)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.2)" }}>
                      Add Friend
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invite link */}
      <div className="mb-6">
        {sectionLabel("Invite Link")}
        {inviteUrl ? (
          <div className="flex items-center gap-2">
            <input readOnly value={inviteUrl} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "rgba(255,255,255,0.6)", fontSize: "0.75rem", outline: "none" }} />
            <button onClick={copyInvite}
              className="px-3 py-2 rounded-lg text-xs font-bold shrink-0 transition-all"
              style={{ background: inviteCopied ? "rgba(200,240,0,0.2)" : "rgba(255,255,255,0.07)", color: inviteCopied ? "#c8f000" : "rgba(255,255,255,0.6)" }}>
              {inviteCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <button onClick={generateInvite}
            className="px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Generate Invite Link
          </button>
        )}
        <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Link expires in 7 days. Anyone who opens it will be added as your friend.</p>
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="mb-6">
          {sectionLabel(`Friend Requests (${incoming.length})`)}
          <div className="flex flex-col gap-2">
            {incoming.map(req => (
              <div key={req.id} className="flex items-center justify-between px-4 py-3 rounded-xl gap-3"
                style={{ background: "rgba(200,240,0,0.05)", border: "1px solid rgba(200,240,0,0.12)" }}>
                <div className="flex items-center gap-2.5">
                  <Avatar url={req.profile?.avatar_url} username={req.profile?.username} />
                  <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{req.profile?.username}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => respond(req.id, "accepted")}
                    className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
                    style={{ background: "rgba(200,240,0,0.15)", color: "#c8f000", border: "1px solid rgba(200,240,0,0.25)" }}>
                    Accept
                  </button>
                  <button onClick={() => respond(req.id, "declined")}
                    className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)" }}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <div className="mb-6">
          {sectionLabel("Sent Requests")}
          <div className="flex flex-col gap-2">
            {outgoing.map(req => (
              <div key={req.id} className="flex items-center justify-between px-4 py-3 rounded-xl gap-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2.5">
                  <Avatar url={req.profile?.avatar_url} username={req.profile?.username} />
                  <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>{req.profile?.username}</span>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Pending…</span>
                </div>
                <button onClick={() => removeFriend(req.id)}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)" }}>
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div>
        {sectionLabel(`Friends (${friends.length})`)}
        {friends.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>No friends yet. Search above or share an invite link.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {friends.map(f => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3 rounded-xl gap-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2.5">
                  <Avatar url={f.profile?.avatar_url} username={f.profile?.username} />
                  <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{f.profile?.username}</span>
                </div>
                <button onClick={() => removeFriend(f.id)}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                  style={{ background: "rgba(239,68,68,0.07)", color: "rgba(239,68,68,0.6)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  Unfriend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
