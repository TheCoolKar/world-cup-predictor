/**
 * FotMob per-player stats scraper
 *
 * Run with: node scripts/fetchPlayerStats.mjs [--team "Brazil"] [--limit N]
 *   or:     npm run fetch-player-stats        (all 48 teams, ~8-12 min)
 *
 * For every player in every World Cup squad, pulls their detailed season stat
 * profile from FotMob (current club season — the most representative recent
 * data; the WC 2026 tournament itself is only days old so per-tournament
 * stats are still near-empty). Captures goals, assists, passing accuracy,
 * duels won, dribble success rate, defensive actions, keeper stats, etc.,
 * each with FotMob's percentile rank vs positional peers.
 *
 * Outputs:
 *   src/data/player_stats.json   — keyed by FotMob player id
 *   src/data/team_lineups.json   — players re-stamped with their `id` so the
 *                                  UI can look up stats (and load photos)
 *
 * Data source: FotMob's unofficial API (same as the live feed / squad scripts).
 * Player photos: https://images.fotmob.com/image_resources/playerimages/{id}.png
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FOTMOB = "https://www.fotmob.com/api/data";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

const args      = process.argv.slice(2);
const ONLY_TEAM = args.includes("--team")  ? args[args.indexOf("--team") + 1]  : null;
const LIMIT     = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const IDS_CACHE    = path.join(__dirname, "fotmob_team_ids.json");
const LINEUPS_PATH = path.join(ROOT, "src/data/team_lineups.json");
const STATS_PATH   = path.join(ROOT, "src/data/player_stats.json");

if (!fs.existsSync(IDS_CACHE)) {
  console.error("❌  scripts/fotmob_team_ids.json missing — run `npm run fetch-squads` first.");
  process.exit(1);
}

const teamIds = JSON.parse(fs.readFileSync(IDS_CACHE, "utf8"));
const lineups = fs.existsSync(LINEUPS_PATH) ? JSON.parse(fs.readFileSync(LINEUPS_PATH, "utf8")) : {};
const stats   = fs.existsSync(STATS_PATH)   ? JSON.parse(fs.readFileSync(STATS_PATH, "utf8"))   : {};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Curated stat set: localizedTitleId → short label stored in JSON.
// Order matters — the UI renders in this order, filtered by position.
const STAT_KEYS = {
  goals: "Goals",
  assists: "Assists",
  expected_goals: "xG",
  expected_assists: "xA",
  shots: "Shots",
  ShotsOnTarget: "Shots on target",
  chances_created: "Chances created",
  big_chance_created_team_title: "Big chances created",
  successful_passes_accuracy: "Pass accuracy",
  successful_passes: "Accurate passes",
  long_ball_succeeeded_accuracy: "Long ball accuracy",
  crosses_succeeeded_accuracy: "Cross accuracy",
  won_contest_subtitle: "Dribble success rate",
  dribbles_succeeded: "Dribbles",
  duel_won_percent: "Duels won %",
  aerials_won_percent: "Aerials won %",
  touches: "Touches",
  touches_opp_box: "Touches in opp. box",
  "matchstats.headers.tackles": "Tackles",
  interceptions: "Interceptions",
  recoveries: "Recoveries",
  clearances: "Clearances",
  poss_won_att_3rd_team_title: "Poss. won final 3rd",
  // keeper
  clean_sheet_team_title: "Clean sheets",
  goals_conceded_while_on_pitch: "Goals conceded",
  // discipline
  yellow_cards: "Yellow cards",
  red_cards: "Red cards",
};

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

/** Resolve the entryId for a player's most-recent main-league season. */
function resolveEntryId(playerData) {
  const ss = playerData.statSeasons ?? [];
  if (!ss.length) return null;
  const recent = ss[0];
  const tournaments = recent.tournaments ?? [];
  if (!tournaments.length) return null;

  const leagueName = playerData.mainLeague?.leagueName ?? "";
  const leagueBase = leagueName.split(" 20")[0].trim();   // strip season suffix
  const match = tournaments.find(t => t.name === leagueBase || t.name === leagueName);
  return (match ?? tournaments[0]).entryId;
}

/** Pull the curated deep-stat profile for one player. */
async function fetchPlayerProfile(playerId) {
  const pd = await fotmobGet(`/playerData?id=${playerId}`);
  if (!pd) return null;

  const entryId = resolveEntryId(pd);
  const ml = pd.mainLeague ?? {};
  const ratingStat = (ml.stats ?? []).find(s => s.localizedTitleId === "rating");
  const matchStat  = (ml.stats ?? []).find(s => s.localizedTitleId === "matches" || s.title === "Matches");
  const minsStat   = (ml.stats ?? []).find(s => s.title === "Minutes played");

  const profile = {
    name:    pd.name,
    pos:     pd.primaryPosition?.label ?? pd.positionDescription?.primaryPosition?.label ?? null,
    league:  ml.leagueName ?? null,
    season:  ml.season ?? null,
    rating:  typeof ratingStat?.value === "number" ? ratingStat.value : null,
    matches: matchStat?.value ?? null,
    minutes: minsStat?.value ?? null,
    captain: !!pd.isCaptain,
    stats:   {},
  };

  if (entryId) {
    try {
      const ds = await fotmobGet(`/playerStats?playerId=${playerId}&seasonId=${entryId}`);
      const groups = ds?.statsSection?.items ?? [];
      const seen = new Set();
      for (const grp of groups) {
        for (const it of grp.items ?? []) {
          const key = STAT_KEYS[it.localizedTitleId];
          if (!key || seen.has(key)) continue;
          seen.add(key);
          profile.stats[key] = {
            v: it.statValue,
            p: it.percentileRank != null ? Math.round(it.percentileRank) : null,
          };
        }
      }
    } catch { /* deep stats optional — basic profile still useful */ }
  }
  return profile;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const targets = ONLY_TEAM
  ? { [ONLY_TEAM]: teamIds[ONLY_TEAM] }
  : teamIds;

let teamN = 0;
for (const [team, teamId] of Object.entries(targets)) {
  teamN++;
  if (!teamId) { console.warn(`⚠️  ${team}: no FotMob id, skipping`); continue; }

  let squad;
  try {
    const data = await fotmobGet(`/teams?id=${teamId}`);
    squad = data?.squad?.squad ?? [];
  } catch (err) {
    console.warn(`⚠️  ${team}: squad fetch failed (${err.message}), skipping`);
    continue;
  }

  // Build id-stamped player list for team_lineups.json
  const POS_MAP = {
    GK: "GK", RB: "RB", LB: "LB", CB: "CB", RWB: "RWB", LWB: "LWB",
    CDM: "DM", DM: "DM", CM: "CM", CAM: "AM", AM: "AM",
    RM: "RW", LM: "LW", RW: "RW", LW: "LW", ST: "ST", CF: "ST",
  };
  const GROUP_POS = { keepers: "GK", defenders: "CB", midfielders: "CM", attackers: "ST" };
  const mapPos = (m, g) => POS_MAP[(m.positionIdsDesc ?? "").split(",")[0]?.trim()] ?? GROUP_POS[g] ?? "CM";

  const players = [];
  let coach = null;
  let nStats = 0, idx = 0;

  for (const g of squad) {
    if (g.title === "coach") { coach = g.members?.[0]?.name ?? null; continue; }
    for (const m of g.members ?? []) {
      if (idx++ >= LIMIT) break;
      players.push({ id: m.id, name: m.name, pos: mapPos(m, g.title), club: m.cname ?? "—", age: m.age ?? null });

      try {
        const profile = await fetchPlayerProfile(m.id);
        if (profile) {
          stats[m.id] = { ...profile, team, club: m.cname ?? "—", age: m.age ?? null, shirt: m.shirtNumber ?? null };
          if (Object.keys(profile.stats).length) nStats++;
        }
      } catch (err) {
        // keep going; player just won't have a stat profile
      }
      await sleep(220);
    }
  }

  lineups[team] = {
    formation: lineups[team]?.formation ?? null,
    coach:     coach ?? lineups[team]?.coach ?? null,
    players,
  };

  // Persist incrementally so an interrupted run keeps progress
  fs.writeFileSync(LINEUPS_PATH, JSON.stringify(lineups, null, 2));
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));

  console.log(`[${teamN}/${Object.keys(targets).length}] ${team}: ${players.length} players · ${nStats} with deep stats · ${coach ?? "?"}`);
  await sleep(300);
}

console.log(`\n✅ Wrote ${STATS_PATH} (${Object.keys(stats).length} players)`);
console.log(`✅ Updated ${LINEUPS_PATH} with player ids`);
