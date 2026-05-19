export function predictMatch(eloHome, eloAway) {
    const diff = eloAway - eloHome;
    const homeWinProb = 1 / (1 + Math.pow(10, diff / 400));
    const awayWinProb = 1 - homeWinProb;
    return {
        homeWin: (homeWinProb * 100).toFixed(1) + "%",
        awayWin: (awayWinProb * 100).toFixed(1) + "%",
        favorite: homeWinProb > 0.5 ? "home" : "away"
    };
}