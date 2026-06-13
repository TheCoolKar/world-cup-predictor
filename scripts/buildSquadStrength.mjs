/**
 * Build per-team squad strength index from player stats + market values.
 *
 * Run with: node scripts/buildSquadStrength.mjs   (or npm run build-squad-strength)
 *
 * Combines two squad-quality signals into one standardised index the
 * prediction model consumes:
 *
 *   1. Market value (team_squad_quality.json) — slow-moving quality anchor,
 *      clean across leagues.
 *   2. League-normalised player rating (player_stats.json) — current-season
 *      form. Raw FotMob ratings are league-inflated (a 7.3 in a weak league
 *      ≠ a 7.3 in the Premier League), so each player's rating is adjusted
 *      down by a league-strength coefficient before aggregating. After this
 *      normalisation the team rating correlates ~0.84 with log market value
 *      (vs ~0.52 raw) while still carrying independent form information.
 *
 * Output: augments src/data/team_squad_quality.json with, per team:
 *   formRating    — league-normalised, minutes-weighted mean of top-16 players
 *   formRatingRaw — un-normalised version (display/debug only)
 *   strengthIndex — 0.6·z(log marketValue) + 0.4·z(formRating), standardised
 *                   across the 48 teams. The model uses the *difference* of
 *                   two teams' strengthIndex as its squad feature.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const STATS_PATH   = path.join(ROOT, "src/data/player_stats.json");
const QUALITY_PATH = path.join(ROOT, "src/data/team_squad_quality.json");

const playerStats = JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
const quality     = JSON.parse(fs.readFileSync(QUALITY_PATH, "utf8"));

// ── League strength coefficients (0.40–1.00) ────────────────────────────────
// Domain-knowledge tiers (UEFA coefficients + global league reputation).
// Used only to de-inflate cross-league rating differences.
const LEAGUE_STRENGTH = {
  "Premier League": 1.00, "LaLiga": 0.97, "Serie A": 0.93, "Bundesliga": 0.93, "Ligue 1": 0.86,
  "Liga Portugal": 0.78, "Eredivisie": 0.75, "Championship": 0.70, "Belgian Pro League": 0.70,
  "Super Lig": 0.68, "Liga Profesional Apertura": 0.70, "Liga Profesional": 0.70,
  "Brasileirão": 0.72, "Brasileirao": 0.72, "Serie A Brazil": 0.72,
  "Saudi Pro League": 0.63, "Major League Soccer": 0.62, "Liga MX Clausura": 0.62, "Liga MX": 0.62,
  "Premiership": 0.60, "Super League": 0.58, "1. Liga": 0.56, "Eliteserien": 0.56,
  "Superligaen": 0.60, "K-League 1": 0.58, "J. League 100 Year Vision League East": 0.58,
  "A-League Men": 0.52, "Amir of Qatar Cup": 0.50, "Pro League": 0.55, "HNL": 0.55,
  "Cyprus League": 0.50, "2. Bundesliga": 0.55, "Ligue 2": 0.52, "LaLiga2": 0.55,
  "Liga Portugal 2": 0.50,
};
const DEFAULT_STRENGTH = 0.55;
const TOP = 1.00;
const PENALTY = 1.6;   // rating points lost from top→0 league strength

const adjustRating = (rating, league) =>
  rating - PENALTY * (TOP - (LEAGUE_STRENGTH[league] ?? DEFAULT_STRENGTH));

// ── Aggregate per team ──────────────────────────────────────────────────────

const byTeam = {};
for (const p of Object.values(playerStats)) {
  if (!p.rating || !p.minutes || !p.team) continue;
  const mins = parseInt(String(p.minutes).replace(/,/g, ""), 10);
  if (!mins) continue;
  (byTeam[p.team] ??= []).push({
    adj: adjustRating(p.rating, p.league),
    raw: p.rating,
    mins,
  });
}

function weightedTopMean(players, key, n = 16) {
  const top = [...players].sort((a, b) => b.mins - a.mins).slice(0, n);
  if (top.length < 8) return null;
  const w = top.reduce((s, p) => s + p.mins, 0);
  return w ? top.reduce((s, p) => s + p[key] * p.mins, 0) / w : null;
}

const teams = {};
for (const [team, players] of Object.entries(byTeam)) {
  teams[team] = {
    formRating:    weightedTopMean(players, "adj"),
    formRatingRaw: weightedTopMean(players, "raw"),
  };
}

// ── Standardise and blend ───────────────────────────────────────────────────

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const std  = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };

const names = Object.keys(quality);
const logMV = {};
for (const t of names) {
  const mv = quality[t]?.marketValueEur;
  logMV[t] = mv > 0 ? Math.log10(mv) : null;
}

const mvVals   = names.map(t => logMV[t]).filter(v => v != null);
const frVals   = names.map(t => teams[t]?.formRating).filter(v => v != null);
const mvMean = mean(mvVals), mvStd = std(mvVals) || 1;
const frMean = mean(frVals), frStd = std(frVals) || 1;

const MV_WEIGHT = 0.6, FR_WEIGHT = 0.4;

for (const t of names) {
  const zMV = logMV[t]            != null ? (logMV[t] - mvMean) / mvStd            : null;
  const zFR = teams[t]?.formRating != null ? (teams[t].formRating - frMean) / frStd : null;

  let strengthIndex;
  if (zMV != null && zFR != null)      strengthIndex = MV_WEIGHT * zMV + FR_WEIGHT * zFR;
  else if (zMV != null)                strengthIndex = zMV;
  else if (zFR != null)                strengthIndex = zFR;
  else                                 strengthIndex = 0;

  quality[t] = {
    ...quality[t],
    formRating:    teams[t]?.formRating    != null ? +teams[t].formRating.toFixed(3)    : null,
    formRatingRaw: teams[t]?.formRatingRaw != null ? +teams[t].formRatingRaw.toFixed(3) : null,
    strengthIndex: +strengthIndex.toFixed(3),
  };
}

fs.writeFileSync(QUALITY_PATH, JSON.stringify(quality, null, 2));

// ── Report ──────────────────────────────────────────────────────────────────

const ranked = names
  .map(t => ({ t, s: quality[t].strengthIndex, fr: quality[t].formRating, mv: Math.round((quality[t].marketValueEur || 0) / 1e6) }))
  .sort((a, b) => b.s - a.s);

console.log("Team strength index (0.6·marketValue + 0.4·league-normalised rating):\n");
console.log("  #  Team             idx   formR   MV(m)");
ranked.forEach((r, i) => {
  if (i < 8 || i >= ranked.length - 5) {
    console.log(`  ${String(i + 1).padStart(2)} ${r.t.padEnd(15)} ${String(r.s).padStart(6)} ${String(r.fr ?? "—").padStart(6)} ${String(r.mv).padStart(6)}`);
  } else if (i === 8) {
    console.log("  ...");
  }
});
console.log(`\n✅ Wrote ${QUALITY_PATH} (${ranked.length} teams)`);
