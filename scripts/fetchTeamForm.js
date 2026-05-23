/**
 * Run with: node scripts/fetchTeamForm.js
 *
 * Fetches recent fixtures for each WC 2026 team from the correct
 * confederation competitions, computes form stats, and saves to
 * src/data/team_form.json.
 *
 * Free tier: 10 req/min, 100 req/day.
 * This script uses at most 2 league lookups per team (~91 total requests).
 * At 7s delay: ~11 minutes total.
 *
 * League IDs used:
 *   5  = UEFA Nations League (2024-25 season)
 *   10 = International Friendlies
 *   27 = AFC WC Qualification 2026
 *   29 = CAF Africa Cup of Nations 2025
 *   30 = CAF WC Qualification 2026
 *   31 = CONCACAF Nations League 2024-25
 *   34 = CONMEBOL WC Qualification 2026
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── API setup ─────────────────────────────────────────────────────────────────

const envRaw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const API_KEY = envRaw.match(/VITE_API_FOOTBALL_KEY=(.+)/)?.[1]?.trim();

if (!API_KEY || API_KEY === "your_key_here") {
  console.error("❌  No API key found. Set VITE_API_FOOTBALL_KEY in your .env file.");
  process.exit(1);
}

const BASE = "https://v3.football.api-sports.io";
const HEADERS = { "x-apisports-key": API_KEY };
const RATE_DELAY = 7000; // 10 req/min max → 6s minimum + buffer

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(endpoint, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE}${endpoint}`, { headers: HEADERS });
    if (res.status === 429) {
      const wait = 65000;
      console.warn(`  ⏳ Rate limited. Waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length) {
      throw new Error(JSON.stringify(json.errors));
    }
    return json;
  }
  throw new Error("Max retries reached");
}

// ── Team IDs (API-Football national team IDs) ─────────────────────────────────

const TEAM_IDS = {
  // UEFA
  "England":                 10,
  "France":                   2,
  "Germany":                 25,
  "Spain":                    9,
  "Portugal":                27,
  "Netherlands":             34,
  "Belgium":                  1,
  "Croatia":                  3,
  "Switzerland":             15,
  "Austria":                 44,
  "Scotland":                35,
  "Sweden":                  14,
  "Czechia":                 29,
  "Bosnia":  21,
  "Türkiye":                777,  // Turkey — verify if 0 results returned
  "Norway":                  53,

  // CONMEBOL
  "Argentina":               26,
  "Brazil":                   6,
  "Uruguay":                 32,
  "Colombia":                 8,
  "Ecuador":                 57,
  "Paraguay":                38,

  // CAF
  "Morocco":                 31,
  "Algeria":                 46,
  "Senegal":                 37,
  "Ivory Coast":             42,
  "Egypt":                   36,
  "Tunisia":                 49,
  "Ghana":                   22,
  "South Africa":           181,
  "Cape Verde":             204,
  "DR Congo":               164,

  // AFC
  "Japan":                   30,
  "South Korea":             48,
  "Iran":                    45,
  "Saudi Arabia":            60,
  "Uzbekistan":             330,
  "Jordan":                 163,
  "Iraq":                   162,
  "Qatar":                  184,
  "Australia":               24,

  // CONCACAF
  "USA":                     13,
  "Mexico":                  16,
  "Canada":                  43,
  "Panama":                 130,
  "Haiti":                  274,
  "Curaçao":                619,

  // OFC
  "New Zealand":            199,
};

// ── Confederation league lists ────────────────────────────────────────────────
// Each entry = { league: <id>, season: <year> }
// Max 2 per team to stay within 100 req/day limit.

const CONF_LEAGUES = {
  UEFA: [
    { league:  5, season: 2024 }, // UEFA Nations League 2024-25
    { league: 10, season: 2024 }, // International Friendlies
  ],
  CONMEBOL: [
    { league: 34, season: 2024 }, // WC Qualification South America (free tier max: 2024)
    { league: 10, season: 2024 }, // International Friendlies
  ],
  CAF: [
    { league: 29, season: 2023 }, // Africa Cup of Nations 2023
    { league: 30, season: 2024 }, // CAF WC Qualification (free tier max: 2024)
  ],
  AFC: [
    { league: 27, season: 2024 }, // WC Qualification Asia (free tier max: 2024)
    { league: 10, season: 2024 }, // International Friendlies
  ],
  CONCACAF: [
    { league: 31, season: 2024 }, // CONCACAF Nations League
    { league: 10, season: 2024 }, // International Friendlies
  ],
  OFC: [
    { league: 10, season: 2024 }, // Friendlies (best available for OFC teams)
    { league: 10, season: 2023 }, // Fallback to 2023 friendlies
  ],
};

const TEAM_CONF = {
  "England": "UEFA", "France": "UEFA", "Germany": "UEFA", "Spain": "UEFA",
  "Portugal": "UEFA", "Netherlands": "UEFA", "Belgium": "UEFA", "Croatia": "UEFA",
  "Switzerland": "UEFA", "Austria": "UEFA", "Scotland": "UEFA", "Sweden": "UEFA",
  "Czechia": "UEFA", "Bosnia": "UEFA", "Türkiye": "UEFA", "Norway": "UEFA",

  "Argentina": "CONMEBOL", "Brazil": "CONMEBOL", "Uruguay": "CONMEBOL",
  "Colombia": "CONMEBOL", "Ecuador": "CONMEBOL", "Paraguay": "CONMEBOL",

  "Morocco": "CAF", "Algeria": "CAF", "Senegal": "CAF", "Ivory Coast": "CAF",
  "Egypt": "CAF", "Tunisia": "CAF", "Ghana": "CAF", "South Africa": "CAF",
  "Cape Verde": "CAF", "DR Congo": "CAF",

  "Japan": "AFC", "South Korea": "AFC", "Iran": "AFC", "Saudi Arabia": "AFC",
  "Uzbekistan": "AFC", "Jordan": "AFC", "Iraq": "AFC", "Qatar": "AFC",
  "Australia": "AFC",

  "USA": "CONCACAF", "Mexico": "CONCACAF", "Canada": "CONCACAF",
  "Panama": "CONCACAF", "Haiti": "CONCACAF", "Curaçao": "CONCACAF",

  "New Zealand": "OFC",
};

// ── Form calculation ──────────────────────────────────────────────────────────

function calcForm(fixtures, teamId) {
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  const formChars = [];

  for (const f of fixtures) {
    const isHome = f.teams.home.id === teamId;
    const gf = isHome ? f.goals.home : f.goals.away;
    const ga = isHome ? f.goals.away : f.goals.home;
    if (gf === null || ga === null) continue;

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga)        { wins++;   formChars.push("W"); }
    else if (gf === ga) { draws++;  formChars.push("D"); }
    else                { losses++; formChars.push("L"); }
  }

  const played = wins + draws + losses;
  return {
    played,
    wins, draws, losses,
    goalsFor, goalsAgainst,
    goalDiff:   goalsFor - goalsAgainst,
    winRate:    played ? +((wins / played) * 100).toFixed(1) : 0,
    // formScore: W=3pts, D=1pt, as % of max possible (all wins)
    formScore:  played ? +((wins * 3 + draws) / (played * 3) * 100).toFixed(1) : 0,
    recentForm: formChars.reverse().join(""), // most recent first
    fetchedAt:  new Date().toISOString(),
  };
}

// ── Fixture fetcher ───────────────────────────────────────────────────────────

async function fetchFixturesForTeam(teamId, leagues) {
  const all = [];

  for (const { league, season } of leagues) {
    try {
      const data = await apiGet(`/fixtures?team=${teamId}&league=${league}&season=${season}`);
      all.push(...(data.response ?? []));
    } catch (err) {
      console.warn(`    ⚠  league ${league}/${season}: ${err.message}`);
    }
    await sleep(RATE_DELAY);
  }

  // Completed matches only, most recent 10
  return all
    .filter((f) => f.fixture.status.short === "FT")
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 10);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TEAMS = Object.keys(TEAM_IDS);
const totalReqs = TEAMS.reduce((sum, t) => sum + (CONF_LEAGUES[TEAM_CONF[t]]?.length ?? 1), 0);

console.log(`\n📡  Fetching fixtures for ${TEAMS.length} teams`);
console.log(`    ~${totalReqs} API requests at ${RATE_DELAY / 1000}s delay ≈ ${Math.ceil(totalReqs * RATE_DELAY / 60000)} min\n`);

const result = {};

for (const team of TEAMS) {
  const id   = TEAM_IDS[team];
  const conf = TEAM_CONF[team] ?? "OFC";
  const leagues = CONF_LEAGUES[conf];

  try {
    const fixtures = await fetchFixturesForTeam(id, leagues);
    const form = calcForm(fixtures, id);
    result[team] = { apiId: id, ...form };

    const gd = form.goalDiff >= 0 ? `+${form.goalDiff}` : `${form.goalDiff}`;
    const formStr = form.recentForm || "—";
    const status = form.played === 0 ? "⚠  no data" : "✓";
    console.log(
      `  ${status} ${team.padEnd(32)} ${formStr.padEnd(12)}` +
      `${form.wins}W ${form.draws}D ${form.losses}L  GD ${gd.padStart(3)}  score: ${form.formScore}%`
    );
  } catch (err) {
    console.error(`  ✗ ${team}: ${err.message}`);
    result[team] = null;
  }
}

const OUT = path.join(ROOT, "src/data/team_form.json");
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

const withData   = Object.values(result).filter((v) => v?.played > 0).length;
const noData     = Object.values(result).filter((v) => v?.played === 0).length;
const errored    = Object.values(result).filter((v) => v === null).length;

console.log(`\n✅  Done! Saved to src/data/team_form.json`);
console.log(`    ✓ ${withData} teams with data  ⚠  ${noData} with no results  ✗ ${errored} errors`);
console.log(`    Fetched at: ${new Date().toLocaleString()}`);
console.log(`\n💡  Re-run after each matchday to keep form data fresh.`);
console.log(`    Teams still showing 0 games may need their league IDs verified.`);
