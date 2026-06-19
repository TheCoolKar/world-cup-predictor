import { describe, it, expect } from "vitest";
import {
  normalizeConfidence,
  calculateGroupScores,
  buildResultsMap,
  calculateStreaks,
} from "./scoring";

describe("normalizeConfidence", () => {
  it("keeps valid multipliers 2 and 3", () => {
    expect(normalizeConfidence(2)).toBe(2);
    expect(normalizeConfidence(3)).toBe(3);
  });
  it("coerces anything else to 1", () => {
    expect(normalizeConfidence(1)).toBe(1);
    expect(normalizeConfidence(0)).toBe(1);
    expect(normalizeConfidence(4)).toBe(1);
    expect(normalizeConfidence(undefined)).toBe(1);
    expect(normalizeConfidence("2")).toBe(1); // string, not number
  });
});

describe("calculateGroupScores", () => {
  const results = {
    A1: { result: "home" },
    A2: { result: "draw" },
    A3: { result: "away" },
  };

  it("awards 1 point per correct pick by default", () => {
    const picks = { A1: "home", A2: "draw", A3: "home" }; // 2 correct, 1 wrong
    expect(calculateGroupScores(picks, results)).toEqual({ points: 2, correct: 2, incorrect: 1 });
  });

  it("applies the confidence multiplier on correct picks only", () => {
    const picks = { A1: "home", A2: "home" };          // A1 right, A2 wrong
    const confidence = { A1: 3, A2: 3 };               // multiplier ignored on wrong pick
    expect(calculateGroupScores(picks, results, confidence)).toEqual({ points: 3, correct: 1, incorrect: 1 });
  });

  it("skips matches that have no result yet", () => {
    const picks = { A1: "home", Z9: "home" };          // Z9 not in results
    expect(calculateGroupScores(picks, results)).toEqual({ points: 1, correct: 1, incorrect: 0 });
  });

  it("handles empty inputs", () => {
    expect(calculateGroupScores()).toEqual({ points: 0, correct: 0, incorrect: 0 });
  });
});

describe("buildResultsMap", () => {
  it("keys rows by match_id", () => {
    const rows = [
      { match_id: "A1", result: "home", home_score: 2, away_score: 0 },
      { match_id: "B3", result: "draw", home_score: 1, away_score: 1 },
    ];
    const map = buildResultsMap(rows);
    expect(map.A1.home_score).toBe(2);
    expect(map.B3.result).toBe("draw");
    expect(Object.keys(map)).toHaveLength(2);
  });
  it("returns {} for no rows", () => {
    expect(buildResultsMap()).toEqual({});
  });
});

describe("calculateStreaks", () => {
  // Uses real fixture ordering. A1 and A2 are both June 11 (A1 earlier).
  it("counts consecutive correct picks in kickoff order", () => {
    const picks = { A1: "home", A2: "away" };
    const results = { A1: { result: "home" }, A2: { result: "away" } };
    expect(calculateStreaks(picks, results)).toEqual({ current: 2, best: 2, graded: 2 });
  });

  it("resets current streak on a wrong pick but keeps best", () => {
    // A1 correct, A2 wrong → best 1, current 0
    const picks = { A1: "home", A2: "home" };
    const results = { A1: { result: "home" }, A2: { result: "away" } };
    const out = calculateStreaks(picks, results);
    expect(out.best).toBe(1);
    expect(out.current).toBe(0);
    expect(out.graded).toBe(2);
  });

  it("ignores ungraded matches", () => {
    const picks = { A1: "home", A2: "home" };
    const results = { A1: { result: "home" } }; // A2 not graded
    expect(calculateStreaks(picks, results)).toEqual({ current: 1, best: 1, graded: 1 });
  });
});
