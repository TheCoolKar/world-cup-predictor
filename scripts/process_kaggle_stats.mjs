/**
 * Processes the Kaggle international football dataset (1872–2026) and
 * generates two JSON files used by the predictor:
 *
 *   src/data/team_historical_stats.json  — per-team stats & form
 *   src/data/h2h_stats.json             — head-to-head for every WC 2026 fixture
 *
 * Run with:
 *   node scripts/process_kaggle_stats.mjs
 *
 * CSV sources (place in ~/Downloads/archive/):
 *   results.csv      — all match results 1872–2026
 *   goalscorers.csv  — individual goalscorer records
 *   shootouts.csv    — penalty shootout outcomes
 *   former_names.csv — historical country name mappings
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const CSV_DIR   = path.join(process.env.HOME, "Downloads", "archive");

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  const raw   = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const row  = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
}

// ── WC 2026 teams (must match elo_ratings.json keys exactly) ─────────────────

const WC_TEAMS = [
  "Argentina", "France", "England", "Spain", "Brazil", "Portugal",
  "Germany", "Netherlands", "Switzerland", "Belgium", "Croatia", "Uruguay",
  "Austria", "Colombia", "Morocco", "Scotland", "Japan", "Mexico",
  "Sweden", "USA", "Norway", "Algeria", "Czechia", "Senegal",
  "South Korea", "Ecuador", "Bosnia and Herzegovina", "Nigeria", "Iran",
  "Canada", "Australia", "Ivory Coast", "Egypt", "Tunisia", "Paraguay",
  "Ghana", "Saudi Arabia", "Panama", "South Africa", "Uzbekistan",
  "Jordan", "Iraq", "Qatar", "DR Congo", "New Zealand", "Cape Verde",
  "Haiti", "Türkiye", "Curaçao",
];

// App name → dataset name (only entries that differ)
const TO_DATASET = {
  "USA":                    "United States",
  "Czechia":                "Czech Republic",
  "Türkiye":                "Turkey",
};

// Dataset name → app name (reverse map + former names handled below)
const TO_APP = {};
for (const [app, ds] of Object.entries(TO_DATASET)) TO_APP[ds] = app;
WC_TEAMS.forEach(t => { if (!TO_DATASET[t]) TO_APP[t] = t; });

// ── Load CSVs ─────────────────────────────────────────────────────────────────

console.log("📂  Loading CSV files...");
const results     = parseCSV(path.join(CSV_DIR, "results.csv"));
const goalscorers = parseCSV(path.join(CSV_DIR, "goalscorers.csv"));
const shootouts   = parseCSV(path.join(CSV_DIR, "shootouts.csv"));
const formerNames = parseCSV(path.join(CSV_DIR, "former_names.csv"));

console.log(`    results.csv      → ${results.length.toLocaleString()} rows`);
console.log(`    goalscorers.csv  → ${goalscorers.length.toLocaleString()} rows`);
console.log(`    shootouts.csv    → ${shootouts.length.toLocaleString()} rows`);
console.log(`    former_names.csv → ${formerNames.length.toLocaleString()} rows\n`);

// ── Build former-name → current app-name mapping ──────────────────────────────
// former_names.csv: current | former | start_date | end_date
// "current" uses dataset names, so map through TO_APP as well.

const FORMER_TO_APP = { ...TO_APP };
for (const { current, former } of formerNames) {
  const appName = TO_APP[current] ?? current;
  if (WC_TEAMS.includes(appName)) {
    FORMER_TO_APP[former] = appName;
  }
}

function normalize(name) {
  return FORMER_TO_APP[name] ?? TO_APP[name] ?? name;
}

// ── Build shootout lookup: "date|home|away" → winner (app name) ───────────────

const shootoutMap = {};
for (const s of shootouts) {
  const key = `${s.date}|${normalize(s.home_team)}|${normalize(s.away_team)}`;
  shootoutMap[key] = normalize(s.winner);
}

// ── Filter to completed matches (no NA scores) ────────────────────────────────

const RECENT_CUTOFF = "2018-01-01"; // for "recent form" stats
const MODERN_CUTOFF = "2010-01-01"; // for H2H recency

// Competitive tournament keywords (exclude pure friendlies for form)
const COMPETITIVE = new Set([
  "FIFA World Cup",
  "FIFA World Cup qualification",
  "UEFA Euro",
  "UEFA Euro qualification",
  "UEFA Nations League",
  "Copa América",
  "African Cup of Nations",
  "African Cup of Nations qualification",
  "AFC Asian Cup",
  "AFC Asian Cup qualification",
  "CONCACAF Nations League",
  "Gold Cup",
  "Copa América qualification",
  "Confederations Cup",
]);

const completedMatches = results.filter(r =>
  r.home_score !== "NA" && r.away_score !== "NA" &&
  r.home_score !== ""   && r.away_score !== ""
);

console.log(`⚽  ${completedMatches.length.toLocaleString()} completed matches found.\n`);

// ── Helper: compute stats from a list of matches for one team ─────────────────

function computeStats(matches, teamAppName) {
  let wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;
  const formChars = [];

  for (const m of matches) {
    const home = normalize(m.home_team);
    const away = normalize(m.away_team);
    const isHome = home === teamAppName;

    const gf = parseInt(isHome ? m.home_score : m.away_score);
    const ga = parseInt(isHome ? m.away_score : m.home_score);

    goalsFor     += gf;
    goalsAgainst += ga;
    if (ga === 0) cleanSheets++;

    // Check if this was a shootout and who really won
    const shootoutKey = `${m.date}|${home}|${away}`;
    const shootoutWinner = shootoutMap[shootoutKey];

    let result;
    if (gf > ga)        result = "W";
    else if (gf === ga) {
      if (shootoutWinner) result = shootoutWinner === teamAppName ? "W" : "L";
      else                result = "D";
    } else              result = "L";

    if (result === "W") wins++;
    else if (result === "D") draws++;
    else losses++;

    formChars.push(result);
  }

  const played = wins + draws + losses;
  return {
    played,
    wins, draws, losses,
    goalsFor,
    goalsAgainst,
    goalDiff:        goalsFor - goalsAgainst,
    winRate:         played ? +((wins / played) * 100).toFixed(1) : 0,
    drawRate:        played ? +((draws / played) * 100).toFixed(1) : 0,
    avgGoalsFor:     played ? +(goalsFor / played).toFixed(2) : 0,
    avgGoalsAgainst: played ? +(goalsAgainst / played).toFixed(2) : 0,
    cleanSheetRate:  played ? +((cleanSheets / played) * 100).toFixed(1) : 0,
    // Most recent first, capped at 10 chars
    recentForm:      formChars.slice(-10).reverse().join(""),
    // formScore: W=3, D=1 as % of max possible (used in Predictions.js blend)
    formScore:       played ? +((wins * 3 + draws) / (played * 3) * 100).toFixed(1) : 0,
  };
}

// ── Build team → matches lookup ───────────────────────────────────────────────

console.log("🔨  Computing team stats...");

const teamMatches = {};
for (const team of WC_TEAMS) teamMatches[team] = [];

for (const m of completedMatches) {
  const home = normalize(m.home_team);
  const away = normalize(m.away_team);
  if (teamMatches[home]) teamMatches[home].push(m);
  if (teamMatches[away]) teamMatches[away].push(m);
}

// ── Per-team stats ────────────────────────────────────────────────────────────

const teamStats = {};

for (const team of WC_TEAMS) {
  const all        = teamMatches[team];
  const recent     = all.filter(m => m.date >= RECENT_CUTOFF);
  const competitive = recent.filter(m => COMPETITIVE.has(m.tournament));
  const wcOnly     = all.filter(m => m.tournament === "FIFA World Cup");
  const wcQual     = all.filter(m => m.tournament === "FIFA World Cup qualification");

  // Shootout record
  let sWon = 0, sLost = 0;
  for (const s of shootouts) {
    if (normalize(s.home_team) === team || normalize(s.away_team) === team) {
      if (normalize(s.winner) === team) sWon++;
      else sLost++;
    }
  }

  teamStats[team] = {
    allTime:     computeStats(all, team),
    recent:      computeStats(recent, team),
    competitive: computeStats(competitive, team), // last ~8yr competitive only
    worldCup:    computeStats(wcOnly, team),
    wcQualifiers:computeStats(wcQual, team),
    shootouts: {
      played:  sWon + sLost,
      won:     sWon,
      lost:    sLost,
      winRate: (sWon + sLost) > 0 ? +((sWon / (sWon + sLost)) * 100).toFixed(1) : null,
    },
  };

  const s = teamStats[team].recent;
  console.log(
    `  ✓ ${team.padEnd(32)}` +
    ` recent: ${s.wins}W ${s.draws}D ${s.losses}L` +
    `  GD ${(s.goalDiff >= 0 ? "+" : "") + s.goalDiff}` +
    `  form: ${s.recentForm || "—"}`
  );
}

// ── Load WC 2026 fixtures for H2H ─────────────────────────────────────────────

console.log("\n🔨  Computing head-to-head stats for WC 2026 fixtures...");

const fixtures = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "wc2026_fixtures.json"), "utf8")
);

const h2h = {};

for (const fix of fixtures) {
  const { id, home, away } = fix;
  const key = `${home} vs ${away}`;

  // All historical meetings between these two teams
  const meetings = completedMatches.filter(m => {
    const h = normalize(m.home_team);
    const a = normalize(m.away_team);
    return (h === home && a === away) || (h === away && a === home);
  }).sort((a, b) => a.date.localeCompare(b.date));

  const recent10 = meetings.filter(m => m.date >= MODERN_CUTOFF);

  function h2hStats(matches) {
    let hw = 0, aw = 0, d = 0, hg = 0, ag = 0;
    for (const m of matches) {
      const mHome = normalize(m.home_team);
      const isHomeHome = mHome === home; // "home" in the WC fixture sense
      const gs1 = parseInt(m.home_score);
      const gs2 = parseInt(m.away_score);
      const gFor  = isHomeHome ? gs1 : gs2;
      const gAgst = isHomeHome ? gs2 : gs1;
      hg += gFor;
      ag += gAgst;
      if (gFor > gAgst)       hw++;
      else if (gFor === gAgst) d++;
      else                    aw++;
    }
    return {
      played: matches.length,
      homeTeamWins: hw,
      awayTeamWins: aw,
      draws: d,
      homeTeamGoals: hg,
      awayTeamGoals: ag,
    };
  }

  // Last 5 meetings summary
  const last5 = meetings.slice(-5).reverse().map(m => {
    const h = normalize(m.home_team);
    const a = normalize(m.away_team);
    return {
      date:        m.date,
      homeTeam:    h,
      awayTeam:    a,
      homeScore:   parseInt(m.home_score),
      awayScore:   parseInt(m.away_score),
      tournament:  m.tournament,
    };
  });

  h2h[id] = {
    fixtureId:   id,
    home,
    away,
    allTime:     h2hStats(meetings),
    since2010:   h2hStats(recent10),
    last5Meetings: last5,
  };

  const s = h2h[id].allTime;
  if (s.played > 0) {
    console.log(
      `  ${id.padEnd(4)} ${home.padEnd(26)} vs ${away.padEnd(26)}` +
      ` — ${s.played} games: ${s.homeTeamWins}W ${s.draws}D ${s.awayTeamWins}L`
    );
  } else {
    console.log(`  ${id.padEnd(4)} ${home.padEnd(26)} vs ${away.padEnd(26)} — no meetings`);
  }
}

// ── Write output files ────────────────────────────────────────────────────────

const statsOut = path.join(ROOT, "src", "data", "team_historical_stats.json");
const h2hOut   = path.join(ROOT, "src", "data", "h2h_stats.json");

fs.writeFileSync(statsOut, JSON.stringify(teamStats, null, 2));
fs.writeFileSync(h2hOut,   JSON.stringify(h2h,       null, 2));

console.log(`\n✅  Done!`);
console.log(`    📄 ${statsOut}`);
console.log(`    📄 ${h2hOut}`);
console.log(`\nData shape:`);
console.log(`  team_historical_stats.json — ${WC_TEAMS.length} teams × { allTime, recent, competitive, worldCup, wcQualifiers, shootouts }`);
console.log(`  h2h_stats.json            — ${fixtures.length} fixtures × { allTime, since2010, last5Meetings }`);
