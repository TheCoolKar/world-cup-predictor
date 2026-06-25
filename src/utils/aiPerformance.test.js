import { describe, expect, it } from "vitest";
import { buildAiPerformanceResultsMap, calculateAiPerformance, predictedOutcome } from "./aiPerformance";

const fixtures = [
  { id: "A1" },
  { id: "A2" },
  { id: "A3" },
  { id: "A4" },
];

const predictions = {
  A1: { homeWin: 60, draw: 25, awayWin: 15, score: { home: 2, away: 0 } },
  A2: { homeWin: 20, draw: 55, awayWin: 25, score: { home: 1, away: 1 } },
  A3: { homeWin: 20, draw: 25, awayWin: 55, score: { home: 0, away: 2 } },
  A4: { homeWin: 45, draw: 25, awayWin: 30, score: { home: 1, away: 0 } },
};

describe("predictedOutcome", () => {
  it("uses the highest of the home, draw, and away probabilities", () => {
    expect(predictedOutcome(predictions.A1)).toBe("home");
    expect(predictedOutcome(predictions.A2)).toBe("draw");
    expect(predictedOutcome(predictions.A3)).toBe("away");
  });

  it("returns null for an incomplete prediction", () => {
    expect(predictedOutcome({ homeWin: 60, awayWin: 40 })).toBeNull();
  });
});

describe("calculateAiPerformance", () => {
  it("counts a match as a hit when either its outcome or exact score is correct", () => {
    const results = {
      A1: { home_score: 1, away_score: 0, result: "home" }, // outcome only
      A2: { home_score: 1, away_score: 1, result: "draw" }, // outcome + exact score
      A3: { home_score: 2, away_score: 0, result: "home" }, // neither
    };

    expect(calculateAiPerformance(fixtures, predictions, results)).toEqual({
      completed: 3,
      played: 3,
      hits: 2,
      outcomeCorrect: 2,
      exactScoreCorrect: 1,
      provisional: 0,
      successRate: 66.7,
      outcomeRate: 66.7,
      exactScoreRate: 33.3,
    });
  });

  it("derives the actual outcome from scores when result is absent", () => {
    const stats = calculateAiPerformance(fixtures, predictions, {
      A2: { home_score: 1, away_score: 1 },
    });
    expect(stats.outcomeCorrect).toBe(1);
    expect(stats.exactScoreCorrect).toBe(1);
  });

  it("ignores unfinished matches and tracks finished matches without snapshots", () => {
    const stats = calculateAiPerformance(fixtures, { A1: predictions.A1 }, {
      A1: { home_score: 2, away_score: 0, result: "home" },
      A2: { home_score: 1, away_score: 1, result: "draw" },
      A3: { home_score: null, away_score: null },
    });
    expect(stats.completed).toBe(2);
    expect(stats.played).toBe(1);
    expect(stats.successRate).toBe(100);
  });

  it("returns zero rates before any results are available", () => {
    expect(calculateAiPerformance(fixtures, predictions, {})).toMatchObject({
      completed: 0,
      played: 0,
      provisional: 0,
      successRate: 0,
      outcomeRate: 0,
      exactScoreRate: 0,
    });
  });
});

describe("buildAiPerformanceResultsMap", () => {
  it("uses live match scores as provisional results", () => {
    const resultsMap = buildAiPerformanceResultsMap([], [
      { match_id: "A1", status: "LIVE", home_score: 1, away_score: 0 },
    ]);

    expect(resultsMap.A1).toMatchObject({
      home_score: 1,
      away_score: 0,
      result: "home",
      provisional: true,
      source: "live",
    });
    expect(calculateAiPerformance(fixtures, predictions, resultsMap)).toMatchObject({
      played: 1,
      provisional: 1,
      outcomeCorrect: 1,
    });
  });

  it("ignores scheduled live rows without a started status", () => {
    const resultsMap = buildAiPerformanceResultsMap([], [
      { match_id: "A1", status: "NS", home_score: 0, away_score: 0 },
    ]);

    expect(resultsMap).toEqual({});
  });

  it("keeps final match_results authoritative over live rows", () => {
    const resultsMap = buildAiPerformanceResultsMap(
      [{ match_id: "A1", home_score: 2, away_score: 0, result: "home", source: "api" }],
      [{ match_id: "A1", status: "LIVE", home_score: 0, away_score: 1 }],
    );

    expect(resultsMap.A1).toMatchObject({
      home_score: 2,
      away_score: 0,
      result: "home",
      source: "api",
    });
    expect(resultsMap.A1.provisional).toBeUndefined();
  });
});
