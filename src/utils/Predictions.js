/**
 * Blended prediction: 80% ELO rating + 20% recent form score.
 * Falls back to pure ELO for teams with no form data.
 *
 * ELO win probability uses the standard formula:
 *   P(home wins) = 1 / (1 + 10^((eloAway - eloHome) / 400))
 *
 * Form score is a points-based metric (W=3, D=1) as % of max possible,
 * sourced from the last ~10 international fixtures via API-Football.
 */

const ELO_WEIGHT  = 0.80;
const FORM_WEIGHT = 0.20;

// Convert a raw ELO rating to a 0–100 scale so it's comparable with formScore.
// We anchor: 1400 = 0%, 2200 = 100% (covers the realistic national team range).
function eloToScore(elo) {
  return Math.min(100, Math.max(0, ((elo - 1400) / (2200 - 1400)) * 100));
}

export function predictMatch(eloHome, eloAway, formHome = null, formAway = null) {
  // ── ELO win probability ───────────────────────────────────────────────────
  const eloDiff = eloAway - eloHome;
  const eloHomeWin = 1 / (1 + Math.pow(10, eloDiff / 400));
  const eloAwayWin = 1 - eloHomeWin;

  // ── Blended score (only if both teams have form data) ────────────────────
  const hasForm = formHome !== null && formAway !== null &&
                  formHome.played > 0 && formAway.played > 0;

  let homeWinProb, awayWinProb;

  if (hasForm) {
    const eloScoreHome = eloToScore(eloHome);
    const eloScoreAway = eloToScore(eloAway);

    const blendedHome = (ELO_WEIGHT * eloScoreHome) + (FORM_WEIGHT * formHome.formScore);
    const blendedAway = (ELO_WEIGHT * eloScoreAway) + (FORM_WEIGHT * formAway.formScore);

    const total = blendedHome + blendedAway || 1;
    homeWinProb = blendedHome / total;
    awayWinProb = blendedAway / total;
  } else {
    homeWinProb = eloHomeWin;
    awayWinProb = eloAwayWin;
  }

  return {
    homeWin:  +(homeWinProb * 100).toFixed(1),
    awayWin:  +(awayWinProb * 100).toFixed(1),
    favorite: homeWinProb >= 0.5 ? "home" : "away",
    usedForm: hasForm,
  };
}
