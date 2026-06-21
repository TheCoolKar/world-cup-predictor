import { describe, expect, it } from "vitest";
import { featureLabel, formatDuration, pageLabel } from "./analytics";

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
});

