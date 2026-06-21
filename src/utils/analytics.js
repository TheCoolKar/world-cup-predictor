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

