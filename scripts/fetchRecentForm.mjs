/**
 * Recent-form updater — FotMob → team_form.json + team_historical_stats.json
 *
 * Run with: node scripts/fetchRecentForm.mjs [--team "Brazil"] [--n 10]
 *   or:     npm run fetch-form
 *
 * Rebuilds each team's current-form snapshot from their most recent finished
 * matches on FotMob — pre-tournament friendlies, World Cup qualifiers, and the
 * tournament games themselves as they're played. Run it through the group stage
 * to keep form current.
 *
 * Writes:
 *   src/data/team_form.json            — recent-form snapshot per team:
 *     played / W-D-L / GF-GA / avgGoalsFor / avgGoalsAgainst / ppg / winRate /
 *     formScore (0-100) / recentForm ("WWDLW", oldest→newest) / matches[] list
 *   src/data/team_historical_stats.json — refreshes each team's `recent.recentForm`
 *     and `recent.formScore` so displays reflect actual recent results (the
 *     stable allTime/competitive aggregates are left untouched).
 *
 * The prediction model blends this recent form into its goal-rate features
 * (see getAdjustedGoalRates in Predictions.js), so updating it shifts both win
 * probabilities and predicted scorelines toward current form.
 *
 * Data source: FotMob's unofficial API (same as the other fetch-* scripts).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FOTMOB = "https://www.fotmob.com/api/data";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

const args      = process.argv.slice(2);
const ONLY_TEAM = args.includes("--team") ? args[args.indexOf("--team") + 1] : null;
const N         = args.includes("--n") ? Number(args[args.indexOf("--n") + 1]) : 10;

const IDS_CACHE   = path.join(__dirname, "fotmob_team_ids.json");
const FORM_PATH   = path.join(ROOT, "src/data/team_form.json");
const HIST_PATH   = path.join(ROOT, "src/data/team_historical_stats.json");

const teamIds = JSON.parse(fs.readFileSync(IDS_CACHE, "utf8"));
const form    = fs.existsSync(FORM_PATH) ? JSON.parse(fs.readFileSync(FORM_PATH, "utf8")) : {};
const hist    = fs.existsSync(HIST_PATH) ? JSON.parse(fs.readFileSync(HIST_PATH, "utf8")) : {};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

async function fotmobGet(endpoint, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(`${FOTMOB}${endpoint}`, { headers: UA });
      if (res.status === 429) { await sleep(15_000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await sleep(2_500 * i);
    }
  }
}

/** Build a recent-form snapshot from a team's finished fixtures. */
function buildForm(teamId, fixtures) {
  const finished = (fixtures ?? [])
    .filter(m => m.status?.finished && !m.status?.cancelled)
    .filter(m => Number(m.home?.score) >= 0 && Number(m.away?.score) >= 0)
    .sort((a, b) => new Date(a.status.utcTime) - new Date(b.status.utcTime));

  const recent = finished.slice(-N);   // last N, chronological (oldest→newest)
  if (!recent.length) return null;

  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  const formChars = [];
  const matches = [];

  for (const m of recent) {
    const isHome = m.home?.id === teamId;
    const ourScore  = Number(isHome ? m.home.score : m.away.score);
    const oppScore  = Number(isHome ? m.away.score : m.home.score);
    const opponent  = isHome ? m.away?.name : m.home?.name;
    gf += ourScore; ga += oppScore;
    let r;
    if (ourScore > oppScore)      { w++; r = "W"; }
    else if (ourScore < oppScore) { l++; r = "L"; }
    else                          { d++; r = "D"; }
    formChars.push(r);
    matches.push({
      date: m.status.utcTime.slice(0, 10),
      opponent, result: r,
      score: `${ourScore}-${oppScore}`,
      competition: m.tournament?.name ?? "",
      home: isHome,
    });
  }

  const played = recent.length;
  const points = w * 3 + d;
  const ppg    = points / played;
  const gdPg   = (gf - ga) / played;
  // formScore: points-per-game percentage with a small goal-difference tilt
  const formScore = clamp(Math.round(100 * (0.85 * (ppg / 3) + 0.15 * (0.5 + clamp(gdPg / 4, -0.5, 0.5)))), 0, 100);

  return {
    played, wins: w, draws: d, losses: l,
    goalsFor: gf, goalsAgainst: ga, goalDiff: gf - ga,
    winRate: +(100 * w / played).toFixed(1),
    avgGoalsFor: +(gf / played).toFixed(2),
    avgGoalsAgainst: +(ga / played).toFixed(2),
    ppg: +ppg.toFixed(2),
    formScore,
    recentForm: formChars.join(""),
    matches,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

const targets = ONLY_TEAM ? { [ONLY_TEAM]: teamIds[ONLY_TEAM] } : teamIds;
let n = 0;

for (const [team, teamId] of Object.entries(targets)) {
  n++;
  if (!teamId) { console.warn(`⚠️  ${team}: no FotMob id`); continue; }
  try {
    const data = await fotmobGet(`/teams?id=${teamId}`);
    const fixtures = data?.fixtures?.allFixtures?.fixtures ?? [];
    const snap = buildForm(teamId, fixtures);
    if (!snap) { console.warn(`⚠️  ${team}: no finished fixtures`); continue; }

    // Preserve any prior apiId; replace the rest with the fresh snapshot
    form[team] = { apiId: form[team]?.apiId, fotmobId: teamId, ...snap };

    // Refresh the recent-form display fields in historical stats (leave aggregates)
    if (hist[team]?.recent) {
      hist[team].recent.recentForm = snap.recentForm;
      hist[team].recent.formScore  = snap.formScore;
    }

    fs.writeFileSync(FORM_PATH, JSON.stringify(form, null, 2));
    fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 2));

    const last5 = snap.matches.slice(-5).map(m => `${m.result}`).join("");
    console.log(`[${n}/${Object.keys(targets).length}] ${team}: ${snap.recentForm} · ${snap.wins}W-${snap.draws}D-${snap.losses}L · ${snap.avgGoalsFor}/${snap.avgGoalsAgainst} GF/GA · form ${snap.formScore}`);
  } catch (err) {
    console.warn(`⚠️  ${team} failed: ${err.message}`);
  }
  await sleep(350);
}

console.log(`\n✅ Updated ${FORM_PATH}`);
console.log(`✅ Refreshed recent-form strings in ${HIST_PATH}`);
