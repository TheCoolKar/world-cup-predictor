/**
 * Run with: node scripts/fetchTeamForm.js
 *
 * Fetches last 10 fixtures for each WC 2026 team, computes form stats,
 * and saves to src/data/team_form.json.
 *
 * Free tier limit: 10 req/min → 7s delay between calls → ~6 min total.
 * No ID-lookup phase needed — national team IDs are hardcoded below.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Read API key from .env ────────────────────────────────────────────────────
const envRaw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const API_KEY = envRaw.match(/VITE_API_FOOTBALL_KEY=(.+)/)?.[1]?.trim();

if (!API_KEY || API_KEY === "your_key_here") {
  console.error("❌  No API key found. Set VITE_API_FOOTBALL_KEY in your .env file.");
  process.exit(1);
}

const BASE = "https://v3.football.api-sports.io";
const HEADERS = { "x-apisports-key": API_KEY };
const RATE_DELAY = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(endpoint) {
  const res = await fetch(`${BASE}${endpoint}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json;
}

// ── Hardcoded national team IDs from API-Football ────────────────────────────
// Source: https://www.api-football.com/documentation-v3#tag/Teams
const TEAM_IDS = {
  "Argentina":              26,
  "France":                  2,
  "England":                 10,
  "Spain":                    9,
  "Brazil":                   6,
  "Portugal":                27,
  "Germany":                 25,
  "Netherlands":             34,
  "Switzerland":             15,
  "Belgium":                  1,
  "Croatia":                 3,
  "Uruguay":                 32,
  "Austria":                 44,
  "Colombia":                 8,
  "Morocco":                 31,
  "Scotland":                35,
  "Japan":                   30,
  "Mexico":                  16,
  "Sweden":                  14,
  "USA":                     13,
  "Norway":                  53,
  "Algeria":                 46,
  "Czechia":                 29,
  "Senegal":                 37,
  "South Korea":             48,
  "Ecuador":                 57,
  "Bosnia and Herzegovina": 21,
  "Iran":                    45,
  "Canada":                  43,
  "Australia":               24,
  "Ivory Coast":             42,
  "Egypt":                   36,
  "Tunisia":                 49,
  "Paraguay":                38,
  "Ghana":                   16, // will fix below — placeholder
  "Saudi Arabia":            60,
  "Panama":                 130,
  "South Africa":           181,
  "Uzbekistan":             330,
  "Jordan":                 163,
  "Iraq":                   162,
  "Qatar":                  184,
  "DR Congo":               164,
  "New Zealand":            199,
  "Cape Verde":             204,
  "Haiti":                  274,
  "Türkiye":                 19,
  "Curaçao":                619,
};

// Fix Ghana ID (16 was accidentally duplicated with Mexico above)
TEAM_IDS["Ghana"] = 22;

const TEAMS = Object.keys(TEAM_IDS);

// ── Calculate form from fixture list ─────────────────────────────────────────
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

    if (gf > ga)       { wins++;   formChars.push("W"); }
    else if (gf === ga){ draws++;  formChars.push("D"); }
    else               { losses++; formChars.push("L"); }
  }

  const played = wins + draws + losses;
  return {
    played,
    wins, draws, losses,
    goalsFor, goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    winRate:   played ? +((wins / played) * 100).toFixed(1) : 0,
    formScore: played ? +((wins * 3 + draws) / (played * 3) * 100).toFixed(1) : 0,
    recentForm: formChars.reverse().join(""),
    fetchedAt: new Date().toISOString(),
  };
}

// ── League IDs for national team fixtures (free tier supports league+season) ──
// 32 = FIFA World Cup, 34 = WC Qualification (various), 10 = Friendlies
// We fetch 2024 season friendlies + qualifiers and take the 10 most recent.
const NATIONAL_LEAGUES = [
  { league: 10,  season: 2024 }, // International Friendlies
  { league: 34,  season: 2024 }, // WC Qualification CONMEBOL
  { league: 32,  season: 2026 }, // FIFA World Cup 2026
];

async function fetchNationalFixtures(teamId) {
  const all = [];
  for (const { league, season } of NATIONAL_LEAGUES) {
    try {
      const data = await apiGet(`/fixtures?team=${teamId}&league=${league}&season=${season}`);
      all.push(...(data.response ?? []));
      await sleep(RATE_DELAY);
    } catch {
      await sleep(RATE_DELAY);
    }
  }
  // Sort by date descending, take 10 most recent completed matches
  return all
    .filter((f) => f.fixture.status.short === "FT")
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 10);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`📡  Fetching fixtures for ${TEAMS.length} teams (3 league calls each, ~30 min)...\n`);
const result = {};

for (const team of TEAMS) {
  const id = TEAM_IDS[team];
  try {
    const fixtures = await fetchNationalFixtures(id);
    const form = calcForm(fixtures, id);
    result[team] = { apiId: id, ...form };

    const gd = form.goalDiff >= 0 ? `+${form.goalDiff}` : `${form.goalDiff}`;
    console.log(
      `  ✓ ${team.padEnd(32)} ${(form.recentForm || "—").padEnd(12)}` +
      `${form.wins}W ${form.draws}D ${form.losses}L  GD ${gd.padStart(3)}  score: ${form.formScore}%`
    );
  } catch (err) {
    console.error(`  ✗ ${team}: ${err.message}`);
    result[team] = null;
  }
}

const OUT = path.join(ROOT, "src/data/team_form.json");
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

console.log(`\n✅  Done! Saved to src/data/team_form.json`);
console.log(`    Fetched at: ${new Date().toLocaleString()}`);
console.log(`\n💡  Re-run after each matchday to keep form data fresh.`);
