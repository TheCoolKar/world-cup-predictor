const PAGE_LABELS = {
  home: "Home",
  groups: "Group-stage AI predictions",
  bracket: "Simulated bracket",
  mine: "My bracket",
  leaderboard: "Leaderboard",
  schedule: "Schedule & results",
  leagues: "Leagues",
  teams: "Teams",
  profile: "Profile",
  dashboard: "Dashboard",
  invite: "League invite",
};

const FEATURE_LABELS = {
  prediction_saved: "Prediction saved",
  bracket_submitted: "Bracket submitted",
  bracket_withdrawn: "Bracket withdrawn",
  league_created: "League created",
  league_joined: "League joined",
  league_left: "League left",
  league_message_sent: "League message sent",
  profile_updated: "Profile updated",
  friend_request_sent: "Friend request sent",
};

export function pageLabel(page) {
  return PAGE_LABELS[page] ?? String(page ?? "Unknown").replaceAll("_", " ");
}

export function featureLabel(eventName) {
  return FEATURE_LABELS[eventName] ?? String(eventName ?? "Unknown").replaceAll("_", " ");
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

const NON_FEATURE_EVENTS = new Set(["page_view", "heartbeat", "session_start"]);

export function aggregateUserActivity({ sessions = [], events = [], profiles = [], terms = [] }) {
  const users = new Map();
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
  const emailMap = new Map();

  for (const acceptance of terms) {
    if (acceptance.user_id && acceptance.email && !emailMap.has(acceptance.user_id)) {
      emailMap.set(acceptance.user_id, acceptance.email);
    }
  }

  function ensureUser(userId) {
    if (!users.has(userId)) {
      const profile = profileMap.get(userId) ?? {};
      users.set(userId, {
        user_id: userId,
        username: profile.username ?? null,
        avatar_url: profile.avatar_url ?? null,
        email: emailMap.get(userId) ?? null,
        sessions: 0,
        page_views: 0,
        active_seconds: 0,
        feature_actions: 0,
        last_active_at: null,
      });
    }
    return users.get(userId);
  }

  let identifiedPageViews = 0;
  let anonymousPageViews = 0;

  for (const session of sessions) {
    const pageViews = Math.max(0, Number(session.page_views) || 0);
    if (!session.user_id) {
      anonymousPageViews += pageViews;
      continue;
    }

    const user = ensureUser(session.user_id);
    user.sessions += 1;
    user.page_views += pageViews;
    user.active_seconds += Math.max(0, Number(session.active_seconds) || 0);
    identifiedPageViews += pageViews;
    if (session.last_seen_at && (!user.last_active_at || session.last_seen_at > user.last_active_at)) {
      user.last_active_at = session.last_seen_at;
    }
  }

  for (const event of events) {
    if (!event.user_id) continue;
    const user = ensureUser(event.user_id);
    if (!NON_FEATURE_EVENTS.has(event.event_name)) user.feature_actions += 1;
    if (event.created_at && (!user.last_active_at || event.created_at > user.last_active_at)) {
      user.last_active_at = event.created_at;
    }
  }

  const totalPageViews = identifiedPageViews + anonymousPageViews;
  return {
    top_users: [...users.values()].sort((a, b) =>
      b.active_seconds - a.active_seconds ||
      b.page_views - a.page_views ||
      b.sessions - a.sessions
    ),
    identified_users: users.size,
    identified_page_views: identifiedPageViews,
    anonymous_page_views: anonymousPageViews,
    identified_traffic_rate: totalPageViews > 0
      ? Math.round((identifiedPageViews / totalPageViews) * 1000) / 10
      : 0,
  };
}
