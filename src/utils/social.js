import { supabase } from "../lib/supabase";
import { calculateGroupScores, calculateStreaks, buildResultsMap } from "./scoring";
import { scoreBracket } from "./bracketScoring";
import { scoreSurvivor } from "./survivorScoring";

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

/** Fetch all match results as a keyed map. Public read, no auth needed. */
export async function getMatchResults() {
  const { data, error } = await supabase.from("match_results").select("*");
  if (error) throw error;
  return buildResultsMap(data ?? []);
}

/** Fetch actual team names for all knockout matches (M73–M104) from live_matches. */
export async function getKnockoutLiveMatches() {
  const { data } = await supabase
    .from("live_matches")
    .select("match_id, home_team, away_team")
    .like("match_id", "M%");
  return Object.fromEntries((data ?? []).map(m => [m.match_id, m]));
}

/** Fetch league leaderboard using each member's chosen submission. */
export async function getLeagueLeaderboard(leagueId) {
  // Step 1: get all members + their linked submission
  const { data: members, error } = await supabase
    .from("league_members")
    .select("user_id, submission_id")
    .eq("league_id", leagueId);

  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = members.map(m => m.user_id);
  const submissionIds = members.map(m => m.submission_id).filter(Boolean);

  // Step 2: fetch profiles, submissions, and match results in parallel
  const [
    { data: profiles },
    { data: submissions },
    resultsMap,
    liveMatchMap,
  ] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").in("id", userIds),
    submissionIds.length > 0
      ? supabase.from("submissions").select("id, picks, confidence, group_picks_count, updated_at, bracket").in("id", submissionIds)
      : Promise.resolve({ data: [] }),
    getMatchResults(),
    getKnockoutLiveMatches(),
  ]);

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
  const subMap = Object.fromEntries((submissions ?? []).map(s => [s.id, s]));

  const rows = members.map(m => {
    const profile = profileMap[m.user_id] ?? {};
    const sub = m.submission_id ? subMap[m.submission_id] : null;
    const bw = sub?.bracket ?? {};
    const groupScoring = sub?.picks
      ? calculateGroupScores(sub.picks, resultsMap, sub.confidence ?? {})
      : { points: null, correct: null, incorrect: null };
    const koScoring = sub?.bracket
      ? scoreBracket(sub.bracket, resultsMap, liveMatchMap)
      : { totalPoints: 0 };
    const survivorScoring = sub?.bracket
      ? scoreSurvivor(sub.bracket, resultsMap, liveMatchMap)
      : { totalPoints: 0 };
    const streaks = sub?.picks ? calculateStreaks(sub.picks, resultsMap) : { current: 0, best: 0 };
    const knockoutPoints = koScoring.totalPoints + survivorScoring.totalPoints;
    const points = groupScoring.points !== null
      ? groupScoring.points + knockoutPoints
      : knockoutPoints > 0 ? knockoutPoints : null;
    return {
      userId:    m.user_id,
      username:  profile.username ?? "—",
      avatarUrl: profile.avatar_url ?? null,
      pickCount: sub?.group_picks_count ?? 0,
      updatedAt: sub?.updated_at ?? null,
      hasBracket: !!m.submission_id,
      champion:  bw?.F?.[0] ?? null,
      finalist:  bw?.F?.[1] ?? null,
      third:     bw?.["3P"]?.[0] ?? null,
      semis:     (bw?.SF ?? []).filter(Boolean),
      points,
      correct:   groupScoring.correct,
      incorrect: groupScoring.incorrect,
      streak:    streaks.current,
      bestStreak: streaks.best,
    };
  });

  // Sort by points (desc), then by pickCount as tiebreaker
  return rows.sort((a, b) => {
    if (b.points !== a.points) return (b.points ?? -1) - (a.points ?? -1);
    return b.pickCount - a.pickCount;
  });
}
