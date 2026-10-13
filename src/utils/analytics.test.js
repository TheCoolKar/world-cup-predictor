import { describe, expect, it } from "vitest";
import { aggregateUserActivity, featureLabel, formatDuration, pageLabel } from "./analytics";

describe("analytics display helpers", () => {
  it("formats active time compactly", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m");
    expect(formatDuration(3660)).toBe("1h 1m");
  });

  it("uses friendly labels with a readable fallback", () => {
    expect(pageLabel("groups")).toBe("Group-stage AI predictions");
    expect(featureLabel("league_joined")).toBe("League joined");
    expect(featureLabel("custom_event")).toBe("custom event");
  });

  it("attributes sessions, traffic and feature actions to signed-in users", () => {
    const result = aggregateUserActivity({
      sessions: [
        { user_id: "user-1", page_views: 7, active_seconds: 125, last_seen_at: "2026-06-21T12:00:00Z" },
        { user_id: null, page_views: 3, active_seconds: 60, last_seen_at: "2026-06-21T12:01:00Z" },
      ],
      events: [
        { user_id: "user-1", event_name: "page_view", created_at: "2026-06-21T11:59:00Z" },
        { user_id: "user-1", event_name: "league_joined", created_at: "2026-06-21T12:02:00Z" },
      ],
      profiles: [{ id: "user-1", username: "lara", avatar_url: "avatar.jpg" }],
      terms: [{ user_id: "user-1", email: "lara@example.com" }],
    });

    expect(result.identified_users).toBe(1);
    expect(result.identified_page_views).toBe(7);
    expect(result.anonymous_page_views).toBe(3);
    expect(result.identified_traffic_rate).toBe(70);
    expect(result.top_users[0]).toMatchObject({
      username: "lara",
      email: "lara@example.com",
      sessions: 1,
      page_views: 7,
      active_seconds: 125,
      feature_actions: 1,
      last_active_at: "2026-06-21T12:02:00Z",
    });
  });
});
