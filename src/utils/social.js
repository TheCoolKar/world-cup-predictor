import { supabase } from "../lib/supabase";

export function generateJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function generateInviteToken() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Fetch accepted friends for a user, with their profile and picks count. */
export async function getFriends(userId) {
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      id, status, requester_id, addressee_id,
      requester:profiles!friendships_requester_id_fkey(id, username, avatar_url),
      addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)
    `)
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw error;
  return (data ?? []).map(row => {
    const friend = row.requester_id === userId ? row.addressee : row.requester;
    return { friendshipId: row.id, ...friend };
  });
}

/** Fetch all submissions for members of a league, joined with profiles. */
export async function getLeagueLeaderboard(leagueId) {
  const { data, error } = await supabase
    .from("league_members")
    .select(`
      user_id,
      profiles(id, username, avatar_url),
      submissions(group_picks_count, updated_at)
    `)
    .eq("league_id", leagueId);

  if (error) throw error;
  return (data ?? [])
    .map(row => ({
      userId: row.user_id,
      username: row.profiles?.username ?? "—",
      avatarUrl: row.profiles?.avatar_url ?? null,
      pickCount: row.submissions?.group_picks_count ?? 0,
      updatedAt: row.submissions?.updated_at ?? null,
    }))
    .sort((a, b) => b.pickCount - a.pickCount);
}
