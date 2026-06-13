/**
 * FotMob squad & player-quality scraper
 *
 * Run with: node scripts/fetchFotmobSquads.mjs [--stats] [--team "Brazil"]
 *   or:     npm run fetch-squads          (squads only, ~1 min)
 *   or:     npm run fetch-squads-stats    (squads + player stats, ~7 min)
 *
 * Outputs:
 *   src/data/team_lineups.json        — official WC squads (name/pos/club/age + coach)
 *   src/data/team_squad_quality.json  — per-team quality score from player season
 *                                       ratings + market values (--stats only)
 *   scripts/fotmob_team_ids.json      — cached FotMob team id mapping
 *
 * Data source: FotMob's unofficial API (same as scripts/fetchLiveFeed.mjs).
 * Squads are FotMob's official tournament rosters; player ratings are current
 * club-season FotMob ratings (e.g. Alisson → Premier League 2025/26).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FOTMOB    = "https://www.fotmob.com/api/data";
const WC_LEAGUE = 77;
const UA        = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

const args      = process.argv.slice(2);
const WITH_STATS = args.includes("--stats");
const ONLY_TEAM  = args.includes("--team") ? args[args.indexOf("--team") + 1] : null;

const fixtures   = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/wc2026_fixtures.json"), "utf8"));
const LINEUPS_PATH = path.join(ROOT, "src/data/team_lineups.json");
const QUALITY_PATH = path.join(ROOT, "src/data/team_squad_quality.json");
const IDS_CACHE    = path.join(__dirname, "fotmob_team_ids.json");

const existingLineups = fs.existsSync(LINEUPS_PATH)
  ? JSON.parse(fs.readFileSync(LINEUPS_PATH, "utf8"))
  : {};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Team name matching (same aliases as fetchLiveFeed.mjs) ───────────────────

const ALIASES = {
  "bosnia and herzegovina": "bosnia",
  "united states": "usa",
  "turkey": "turkiye",
  "korea republic": "south korea",
  "ir iran": "iran",
  "cote d'ivoire": "ivory coast",
  "cape verde islands": "cape verde",
  "congo dr": "dr congo",
};

function norm(name) {
  if (!name) return "";
  let n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return ALIASES[n] ?? n;
}

// App team names (48) keyed by normalised form
const APP_TEAMS = {};
for (const f of fixtures) {
  APP_TEAMS[norm(f.home)] = f.home;
  APP_TEAMS[norm(f.away)] = f.away;
}

// ── Position mapping → TeamModal keys (GK RB CB LB RWB LWB DM CM AM RW LW ST) ─

const POS_MAP = {
  GK: "GK", RB: "RB", LB: "LB", CB: "CB", RWB: "RWB", LWB: "LWB",
  CDM: "DM", DM: "DM", CM: "CM", CAM: "AM", AM: "AM",
  RM: "RW", LM: "LW", RW: "RW", LW: "LW", ST: "ST", CF: "ST",
};
const GROUP_POS = { keepers: "GK", defenders: "CB", midfielders: "CM", attackers: "ST" };

function mapPos(member, groupTitle) {
  const first = (member.positionIdsDesc ?? "").split(",")[0]?.trim();
  return POS_MAP[first] ?? GROUP_POS[groupTitle] ?? "CM";
}

// ── FotMob fetch ──────────────────────────────────────────────────────────────

async function fotmobGet(endpoint, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(`${FOTMOB}${endpoint}`, { headers: UA });
      if (res.status === 429) { await sleep(20_000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await sleep(3_000 * i);
    }
  }
}

// ── 1. Collect the 48 FotMob team ids from group-stage match days ────────────

async function collectTeamIds() {
  if (fs.existsSync(IDS_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(IDS_CACHE, "utf8"));
    if (Object.keys(cached).length >= 48) {
      console.log(`✓ Using cached team ids (${Object.keys(cached).length})`);
      return cached;
    }
  }

  const ids = {}; // appName → fotmob id
  const dates = [...new Set(fixtures.map(f => f.date))];
  console.log(`Collecting team ids from ${dates.length} match days…`);

  for (const date of dates) {
    const data = await fotmobGet(`/matches?date=${date.replaceAll("-", "")}`);
    for (const lg of data.leagues ?? []) {
      if (lg.primaryId !== WC_LEAGUE && lg.parentLeagueId !== WC_LEAGUE) continue;
      for (const m of lg.matches ?? []) {
        for (const side of [m.home, m.away]) {
          const app = APP_TEAMS[norm(side.longName ?? side.name)];
          if (app && !ids[app]) ids[app] = side.id;
        }
      }
    }
    await sleep(300);
  }

  const missing = Object.values(APP_TEAMS).filter(t => !ids[t]);
  if (missing.length) console.warn(`⚠️  No FotMob id found for: ${missing.join(", ")}`);
  fs.writeFileSync(IDS_CACHE, JSON.stringify(ids, null, 2));
  console.log(`✓ Mapped ${Object.keys(ids).length}/48 teams\n`);
  return ids;
}

// ── 2. Squads ─────────────────────────────────────────────────────────────────

async function fetchSquad(teamId) {
  const data = await fotmobGet(`/teams?id=${teamId}`);
  const groups = data?.squad?.squad ?? [];
  let coach = null;
  const players = [];

  for (const g of groups) {
    if (g.title === "coach") {
      coach = g.members?.[0]?.name ?? null;
      continue;
    }
    for (const m of g.members ?? []) {
      players.push({
        name: m.name,
        pos:  mapPos(m, g.title),
        club: m.cname ?? "—",
        age:  m.age ?? null,
        _id:  m.id, // used for --stats, stripped before writing
      });
    }
  }
  return { coach, players };
}

// ── 3. Player quality stats (--stats) ─────────────────────────────────────────

async function fetchPlayerQuality(playerId) {
  const d = await fotmobGet(`/playerData?id=${playerId}`);
  if (!d) return { rating: null, marketValue: null };

  const ratingStat = (d.mainLeague?.stats ?? []).find(s => s.localizedTitleId === "rating");
  const rating = typeof ratingStat?.value === "number" ? ratingStat.value : null;

  const mvInfo = (d.playerInformation ?? []).find(i => i.translationKey === "transfer_value");
  const marketValue = mvInfo?.value?.numberValue ?? null;

  return { rating, marketValue };
}

function aggregateQuality(players) {
  const ratings = players.map(p => p._rating).filter(r => typeof r === "number").sort((a, b) => b - a);
  const top18   = ratings.slice(0, 18);
  const values  = players.map(p => p._marketValue).filter(v => typeof v === "number");
  return {
    // Mean season rating of the squad's 18 best-rated players.
    // Null when too few players have ratings to be meaningful.
    rating:       top18.length >= 8 ? +(top18.reduce((s, r) => s + r, 0) / top18.length).toFixed(3) : null,
    ratedPlayers: ratings.length,
    marketValueEur: values.length ? values.reduce((s, v) => s + v, 0) : null,
    squadSize:    players.length,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ids = await collectTeamIds();
const teams = ONLY_TEAM ? { [ONLY_TEAM]: ids[ONLY_TEAM] } : ids;

const lineups = { ...existingLineups };
const quality = fs.existsSync(QUALITY_PATH) ? JSON.parse(fs.readFileSync(QUALITY_PATH, "utf8")) : {};

let done = 0;
for (const [team, teamId] of Object.entries(teams)) {
  if (!teamId) { console.warn(`⚠️  Skipping ${team} (no id)`); continue; }
  done++;
  try {
    const { coach, players } = await fetchSquad(teamId);
    if (!players.length) { console.warn(`⚠️  ${team}: empty squad, keeping existing`); continue; }

    if (WITH_STATS) {
      for (const p of players) {
        try {
          const q = await fetchPlayerQuality(p._id);
          p._rating = q.rating;
          p._marketValue = q.marketValue;
        } catch { /* player page failed — skip stats for this player */ }
        await sleep(250);
      }
      quality[team] = aggregateQuality(players);
    }

    lineups[team] = {
      formation: existingLineups[team]?.formation ?? null, // FotMob has no pre-match formation
      coach:     coach ?? existingLineups[team]?.coach ?? null,
      players:   players.map(({ _id, _rating, _marketValue, ...p }) => p),
    };

    const q = quality[team];
    console.log(`[${done}/${Object.keys(teams).length}] ${team}: ${players.length} players · ${coach ?? "?"}`
      + (WITH_STATS && q ? ` · rating ${q.rating ?? "—"} · €${q.marketValueEur ? (q.marketValueEur / 1e6).toFixed(0) + "m" : "—"}` : ""));

    // Persist incrementally so an interrupted run keeps its progress
    fs.writeFileSync(LINEUPS_PATH, JSON.stringify(lineups, null, 2));
    if (WITH_STATS) fs.writeFileSync(QUALITY_PATH, JSON.stringify(quality, null, 2));
  } catch (err) {
    console.warn(`⚠️  ${team} failed: ${err.message} — keeping existing entry`);
  }
  await sleep(400);
}

console.log(`\n✅ Wrote ${LINEUPS_PATH}`);
if (WITH_STATS) console.log(`✅ Wrote ${QUALITY_PATH}`);
