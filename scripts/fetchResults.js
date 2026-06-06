/**
 * Run with: node scripts/fetchResults.js
 *   or:     npm run fetch-results
 *
 * Fetches completed World Cup 2026 fixtures from API-Football,
 * maps them to app fixture IDs (A1, B3, etc.), upserts into Supabase
 * match_results table, and saves a local JSON cache.
 *
 * Requires SUPABASE_SERVICE_KEY in .env (Settings → API → service_role key).
 * Uses only 1 API request per run — well within the 100/day free tier.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────

const envRaw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");

function envVar(name) {
  return envRaw.match(new RegExp(`${name}=(.+)`))?.[1]?.trim();
}

const API_KEY        = envVar("VITE_API_FOOTBALL_KEY");
const SUPABASE_URL   = envVar("VITE_SUPABASE_URL");
const SERVICE_KEY    = envVar("SUPABASE_SERVICE_KEY");

if (!API_KEY) {
  console.error("❌  VITE_API_FOOTBALL_KEY not found in .env");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  SUPABASE_SERVICE_KEY not found in .env");
  console.error("    Get it from: Supabase dashboard → Settings → API → service_role secret");
  process.exit(1);
}

const BASE    = "https://v3.football.api-sports.io";
const HEADERS = { "x-apisports-key": API_KEY };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── API helper ────────────────────────────────────────────────────────────────

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

// ── Supabase upsert via REST ──────────────────────────────────────────────────

async function upsertResults(rows) {
  const url = `${SUPABASE_URL}/rest/v1/match_results`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${body}`);
  }
}

// ── Build fixture lookup: "Home Team|Away Team" → app ID ─────────────────────

const fixturesRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/wc2026_fixtures.json"), "utf8")
);

// Build a normalised name map for fuzzy matching
function normaliseName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")   // strip accents/punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Map: "mexico|south africa" → "A1"
const fixtureByTeams = {};
for (const f of fixturesRaw) {
  const key = `${normaliseName(f.home)}|${normaliseName(f.away)}`;
  fixtureByTeams[key] = f.id;
}

// API-Football uses different names for some teams — map them here
const NAME_MAP = {
  "korea republic":      "south korea",
  "republic of korea":   "south korea",
  "korea dpr":           "north korea",
  "usa":                 "usa",
  "united states":       "usa",
  "turkiye":             "türkiye",
  "turkey":              "türkiye",
  "czech republic":      "czechia",
  "ivory coast":         "ivory coast",
  "cote d'ivoire":       "ivory coast",
  "cape verde":          "cape verde",
  "cape verde islands":  "cape verde",
  "dr congo":            "dr congo",
  "congo dr":            "dr congo",
  "bosnia":              "bosnia",
  "bosnia and herzegovina": "bosnia",
  "curacao":             "curaçao",
  "new zealand":         "new zealand",
};

function resolveTeamName(apiName) {
  const norm = normaliseName(apiName);
  return NAME_MAP[norm] ?? norm;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("\n📡  Fetching WC 2026 fixtures from API-Football...\n");

const data = await apiGet("/fixtures?league=19&season=2026");
const allFixtures = data.response ?? [];

console.log(`    Total fixtures returned: ${allFixtures.length}`);

// Filter to completed matches
const completed = allFixtures.filter(f => f.fixture.status.short === "FT");

console.log(`    Completed (FT): ${completed.length}\n`);

const rows = [];
const unmatched = [];

for (const f of completed) {
  const homeApi = f.teams.home.name;
  const awayApi = f.teams.away.name;
  const homeNorm = resolveTeamName(homeApi);
  const awayNorm = resolveTeamName(awayApi);
  const key = `${homeNorm}|${awayNorm}`;

  const matchId = fixtureByTeams[key];
  if (!matchId) {
    unmatched.push(`${homeApi} vs ${awayApi}  (normalised: "${homeNorm}|${awayNorm}")`);
    continue;
  }

  const homeGoals = f.goals.home;
  const awayGoals = f.goals.away;
  let result;
  if (homeGoals > awayGoals)       result = "home";
  else if (awayGoals > homeGoals)  result = "away";
  else                             result = "draw";

  rows.push({
    match_id:   matchId,
    home_score: homeGoals,
    away_score: awayGoals,
    result,
    source:     "api",
    updated_at: new Date().toISOString(),
  });
}

if (rows.length === 0) {
  console.log("ℹ️   No completed matches found yet. Run this again after the first game.");
  process.exit(0);
}

console.log(`✅  Matched ${rows.length} completed fixture(s):`);
for (const r of rows) {
  console.log(`    ${r.match_id.padEnd(4)} ${r.result.padEnd(5)}  ${r.home_score}–${r.away_score}`);
}

if (unmatched.length > 0) {
  console.warn(`\n⚠️   ${unmatched.length} fixture(s) could not be matched to app IDs:`);
  for (const u of unmatched) console.warn(`    ${u}`);
  console.warn("    Add entries to NAME_MAP in this script to fix them.");
}

// ── Upsert to Supabase ────────────────────────────────────────────────────────

console.log("\n⬆️   Upserting to Supabase match_results...");
await upsertResults(rows);
console.log("    Done.");

// ── Save local cache ──────────────────────────────────────────────────────────

const cacheObj = Object.fromEntries(rows.map(r => [r.match_id, r]));
const cachePath = path.join(ROOT, "src/data/wc2026_results.json");
fs.writeFileSync(cachePath, JSON.stringify(cacheObj, null, 2));
console.log(`\n💾  Cache saved to src/data/wc2026_results.json`);
console.log(`\n    Fetched at: ${new Date().toLocaleString()}`);
console.log("    Re-run after each matchday to pick up new results.\n");
