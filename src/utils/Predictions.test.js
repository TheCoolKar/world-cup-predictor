import { describe, it, expect } from "vitest";
import { getAdjustedGoalRates, predictMatch, predictScore } from "./Predictions";

const hist = { avgGoalsFor: 1.6, avgGoalsAgainst: 1.0, played: 50, drawRate: 22 };

describe("getAdjustedGoalRates", () => {
  it("applies no form blend when recentForm is absent", () => {
    const r = getAdjustedGoalRates(hist, 1700, null);
    expect(r.formWeight).toBe(0);
  });

  it("caps the recent-form weight at 0.30 even with a large sample", () => {
    const form = { played: 50, avgGoalsFor: 3.0, avgGoalsAgainst: 0.2 };
    const r = getAdjustedGoalRates(hist, 1700, form);
    expect(r.formWeight).toBeGreaterThan(0);
    expect(r.formWeight).toBeLessThanOrEqual(0.3);
  });

  it("pulls attack rate up toward hot recent form", () => {
    const base = getAdjustedGoalRates(hist, 1700, null).avgGoalsFor;
    const hot  = getAdjustedGoalRates(hist, 1700, { played: 10, avgGoalsFor: 3.5, avgGoalsAgainst: 0.3 }).avgGoalsFor;
    expect(hot).toBeGreaterThan(base);
  });

  it("ignores a recent sample that is too small (<3 games)", () => {
    const r = getAdjustedGoalRates(hist, 1700, { played: 2, avgGoalsFor: 5, avgGoalsAgainst: 0 });
    expect(r.formWeight).toBe(0);
  });
});

describe("predictMatch", () => {
  it("returns home/away probabilities that sum to ~100%", () => {
    const p = predictMatch(1800, 1500, null, null, hist, hist, null, null, {});
    expect(p.homeWin + p.awayWin).toBeCloseTo(100, 1);
  });

  it("favours the much stronger side by ELO", () => {
    const p = predictMatch(1900, 1300, null, null, hist, hist, null, null, {});
    expect(p.homeWin).toBeGreaterThan(p.awayWin);
    expect(p.favorite).toBe("home");
  });

  it("applies home advantage for identical teams at a home venue", () => {
    const p = predictMatch(1600, 1600, null, null, hist, hist, null, null, {});
    expect(p.homeWin).toBeGreaterThan(p.awayWin); // intercept = home edge
  });

  it("is symmetric for identical teams on a neutral site", () => {
    const p = predictMatch(1600, 1600, null, null, hist, hist, null, null, { neutralSite: true });
    expect(p.homeWin).toBeCloseTo(p.awayWin, 0);
  });

  it("shifts toward the side with the stronger squad strength index", () => {
    const neutral = predictMatch(1600, 1600, null, null, hist, hist, null, null, {});
    const withSquad = predictMatch(1600, 1600, null, null, hist, hist, null, null, {
      homeTeam: "Spain", awayTeam: "Haiti",
    });
    // Spain's squad index >> Haiti's, so home win prob should rise vs neutral
    expect(withSquad.homeWin).toBeGreaterThan(neutral.homeWin);
  });
});

describe("predictScore", () => {
  it("returns an integer scoreline within bounds and a probability", () => {
    const s = predictScore(hist, hist, 0.5, { eloHome: 1600, eloAway: 1600 });
    expect(Number.isInteger(s.home)).toBe(true);
    expect(Number.isInteger(s.away)).toBe(true);
    expect(s.home).toBeGreaterThanOrEqual(0);
    expect(s.home).toBeLessThanOrEqual(6);
    expect(s.prob).toBeGreaterThan(0);
    expect(s.prob).toBeLessThanOrEqual(100);
  });

  it("gives the favourite a scoreline at least as high as the underdog", () => {
    const s = predictScore(hist, hist, 0.85, { eloHome: 1900, eloAway: 1300 });
    expect(s.home).toBeGreaterThanOrEqual(s.away);
  });

  it("offers alternative scorelines", () => {
    const s = predictScore(hist, hist, 0.5, { eloHome: 1600, eloAway: 1600 });
    expect(Array.isArray(s.alternatives)).toBe(true);
    expect(s.alternatives.length).toBeGreaterThan(0);
  });
});
