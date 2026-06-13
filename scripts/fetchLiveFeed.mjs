/**
 * Live match feed poller — FotMob → Supabase
 *
 * Run with: node scripts/fetchLiveFeed.mjs [--watch] [--dry] [--date YYYYMMDD]
 *   or:     npm run live-feed          (watch mode, polls every 60s)
 *
 * Each cycle:
 *   1. One FotMob call for today's matches → filter to World Cup (league 77)
 *   2. Map FotMob matches to app fixture ids (A1–L6 by team names,
 *      M73–M104 knockouts by date + kickoff order)
 *   3. Upsert live_matches (status / minute / score)
 *   4. For started matches, fetch matchDetails → upsert match_events
 *      (goals, cards, substitutions)
 *   5. When a match finishes, upsert the final score into match_results
 *      so pick scoring updates automatically (source: "api")
 *
 * Clients receive every change instantly via Supabase Realtime — they never
 * call FotMob themselves.
 *
 * Requires SUPABASE_SERVICE_KEY in .env (Settings → API → service_role key).
 *
 * NOTE: FotMob's API is unofficial/undocumented. If endpoints change, this
 * script is the only place that needs fixing — the DB schema and UI are
 * source-agnostic.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────

// Read credentials from process.env (CI / scheduled runs) first, falling back
// to a local .env file for hands-on dev. Either source works.
let envRaw = "";
try { envRaw = fs.readFileSync(path.join(ROOT, ".env"), "utf8"); } catch { /* no .env — rely on process.env */ }
const envVar = (name) =>
  process.env[name] ?? envRaw.match(new RegExp(`${name}=(.+)`))?.[1]?.trim();

const SUPABASE_URL = envVar("VITE_SUPABASE_URL");
const SERVICE_KEY  = envVar("SUPABASE_SERVICE_KEY");

const args  = process.argv.slice(2);
const WATCH = args.includes("--watch");
const DRY   = args.includes("--dry");
const dateArg = args[args.indexOf("--date") + 1];
const FORCE_DATE = args.includes("--date") ? dateArg : null;

if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error("❌  SUPABASE_SERVICE_KEY not found in .env");
  console.error("    Get it from: Supabase dashboard → Settings → API → service_role secret");
  console.error("    (or use --dry to preview without writing)");
  process.exit(1);
}

const FOTMOB    = "https://www.fotmob.com/api/data";
const WC_LEAGUE = 77; // FotMob FIFA World Cup parent league id
const UA        = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/wc2026_fixtures.json"), "utf8"));

// Official FIFA 2026 knockout schedule (mirrors KO_SCHEDULE in Schedule.jsx).
// Knockout fixtures are mapped by date + kickoff order since team names
// aren't known in advance. M103 (3rd place, Jul 18) is not tracked by the app.
const KO_SCHEDULE = [
  { id: "M73",  date: "2026-06-28" }, { id: "M74",  date: "2026-06-28" },
  { id: "M75",  date: "2026-06-29" }, { id: "M76",  date: "2026-06-29" },
  { id: "M77",  date: "2026-06-30" }, { id: "M78",  date: "2026-06-30" },
  { id: "M79",  date: "2026-07-01" }, { id: "M80",  date: "2026-07-01" },
  { id: "M81",  date: "2026-07-02" }, { id: "M82",  date: "2026-07-02" },
  { id: "M83",  date: "2026-07-03" }, { id: "M84",  date: "2026-07-03" },
  { id: "M85",  date: "2026-07-04" }, { id: "M86",  date: "2026-07-04" },
  { id: "M87",  date: "2026-07-05" }, { id: "M88",  date: "2026-07-05" },
  { id: "M89",  date: "2026-07-06" }, { id: "M90",  date: "2026-07-06" },
  { id: "M91",  date: "2026-07-07" }, { id: "M92",  date: "2026-07-07" },
  { id: "M93",  date: "2026-07-08" }, { id: "M94",  date: "2026-07-08" },
  { id: "M95",  date: "2026-07-09" }, { id: "M96",  date: "2026-07-09" },
  { id: "M97",  date: "2026-07-11" }, { id: "M98",  date: "2026-07-11" },
  { id: "M99",  date: "2026-07-12" }, { id: "M100", date: "2026-07-12" },
  { id: "M101", date: "2026-07-14" }, { id: "M102", date: "2026-07-15" },
  { id: "M104", date: "2026-07-19" },
];

// ── Team name normalisation (FotMob ↔ app fixture names) ────────────────────

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

// ── FotMob API ────────────────────────────────────────────────────────────────

async function fotmobGet(endpoint) {
  const res = await fetch(`${FOTMOB}${endpoint}`, { headers: UA });
  if (!res.ok) throw new Error(`FotMob HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

/** All World Cup matches on a date (YYYYMMDD). */
async function fetchWcMatches(yyyymmdd) {
  const data = await fotmobGet(`/matches?date=${yyyymmdd}`);
  const out = [];
  for (const lg of data.leagues ?? []) {
    if (lg.primaryId !== WC_LEAGUE && lg.parentLeagueId !== WC_LEAGUE) continue;
    out.push(...(lg.matches ?? []));
  }
  return out;
}

// ── Fixture mapping ───────────────────────────────────────────────────────────

function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function etDateOf(utcTime) {
  return utcTime
    ? new Date(utcTime).toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    : null;
}

/**
 * Map FotMob matches to app fixture ids for ET match day `isoDate`.
 * Group fixtures match by team names (±1 day tolerance, since FotMob groups
 * by UTC date while app fixtures use ET dates). Knockouts match by
 * kickoff order within the ET day.
 */
function mapToFixtures(fmMatches, isoDate) {
  const nearDates = new Set([shiftIso(isoDate, -1), isoDate, shiftIso(isoDate, 1)]);
  const dayGroup  = fixtures.filter(f => nearDates.has(f.date));
  const dayKo     = KO_SCHEDULE.filter(k => k.date === isoDate);
  const mapped    = [];
  const unmatched = [];

  for (const fm of fmMatches) {
    const fmHome = norm(fm.home?.longName ?? fm.home?.name);
    const fmAway = norm(fm.away?.longName ?? fm.away?.name);
    const fx = dayGroup.find(f =>
      (norm(f.home) === fmHome && norm(f.away) === fmAway) ||
      (norm(f.home) === fmAway && norm(f.away) === fmHome)   // defensive: home/away flipped
    );
    if (fx) mapped.push({ fixtureId: fx.id, fm, flipped: norm(fx.home) !== fmHome });
    else unmatched.push(fm);
  }

  // Knockouts: pair this ET day's remaining matches with KO slots by kickoff order
  if (dayKo.length && unmatched.length) {
    const sorted = unmatched
      .filter(fm => etDateOf(fm.status?.utcTime) === isoDate)
      .sort((a, b) => new Date(a.status?.utcTime ?? 0) - new Date(b.status?.utcTime ?? 0));
    sorted.slice(0, dayKo.length).forEach((fm, i) => {
      mapped.push({ fixtureId: dayKo[i].id, fm, flipped: false });
    });
  }

  return mapped;
}

// ── Status / score extraction ─────────────────────────────────────────────────

function extractState(fm) {
  const s = fm.status ?? {};
  let status = "NS";
  if (s.cancelled) status = "CANC";
  else if (s.finished) status = s.reason?.short ?? "FT";
  else if (s.started || s.ongoing) status = s.reason?.short === "HT" ? "HT" : "LIVE";

  return {
    status,
    minute:     s.liveTime?.short?.trim() ?? null,
    home_score: typeof fm.home?.score === "number" ? fm.home.score : null,
    away_score: typeof fm.away?.score === "number" ? fm.away.score : null,
    kickoff:    s.utcTime ?? null,
  };
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────

async function sbUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  if (DRY) {
    console.log(`  [dry] upsert ${table} (${rows.length}):`);
    rows.forEach(r => console.log("       ", JSON.stringify(r).slice(0, 160)));
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table} failed: ${res.status} ${await res.text()}`);
}

// ── Event extraction ──────────────────────────────────────────────────────────

const EVENT_TYPES = new Set(["Goal", "Card", "Substitution", "Half", "AddedTime"]);

function extractEvents(fixtureId, detail, flipped) {
  const raw = detail?.content?.matchFacts?.events?.events ?? [];
  const rows = [];
  raw.forEach((e, seq) => {
    if (!EVENT_TYPES.has(e.type)) return;
    let player = e.player?.name ?? null;
    let detailStr = null;
    if (e.type === "Substitution" && Array.isArray(e.swap) && e.swap.length === 2) {
      player    = e.swap[0]?.name ?? null;                  // coming on
      detailStr = `On: ${e.swap[0]?.name ?? "?"} · Off: ${e.swap[1]?.name ?? "?"}`;
    } else if (e.type === "Goal") {
      detailStr = [e.ownGoal ? "Own goal" : null, e.goalDescription ?? null].filter(Boolean).join(" · ") || null;
    }
    rows.push({
      match_id: fixtureId,
      seq,
      minute:   typeof e.time === "number" ? e.time : null,
      overload: e.overloadTime || null,
      type:     e.type,
      card:     e.card ?? null,
      player,
      assist:   e.assistStr?.replace(/^assist by /i, "") ?? null,
      detail:   detailStr,
      is_home:  typeof e.isHome === "boolean" ? (flipped ? !e.isHome : e.isHome) : null,
    });
  });
  return rows;
}

// ── Poll cycle ────────────────────────────────────────────────────────────────

function todayEt() {
  // Match days roll over on US Eastern time, same convention as the app
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function pollOnce() {
  const isoDate  = FORCE_DATE
    ? `${FORCE_DATE.slice(0, 4)}-${FORCE_DATE.slice(4, 6)}-${FORCE_DATE.slice(6, 8)}`
    : todayEt();

  // An ET match day spans two UTC dates (a 9 PM ET kickoff is 01:00 UTC next
  // day, and FotMob buckets by UTC) — fetch both and dedupe.
  const dates = [isoDate, shiftIso(isoDate, 1)].map(d => d.replaceAll("-", ""));
  const seen  = new Set();
  const fmMatches = [];
  for (const d of dates) {
    for (const m of await fetchWcMatches(d)) {
      if (!seen.has(m.id)) { seen.add(m.id); fmMatches.push(m); }
    }
  }
  if (!fmMatches.length) {
    console.log(`  No World Cup matches on ${isoDate}.`);
    return { liveCount: 0 };
  }

  const mapped = mapToFixtures(fmMatches, isoDate);
  const liveRows = [];
  const resultRows = [];
  let liveCount = 0;

  for (const { fixtureId, fm, flipped } of mapped) {
    const st = extractState(fm);
    const homeName = (flipped ? fm.away : fm.home)?.longName ?? (flipped ? fm.away : fm.home)?.name;
    const awayName = (flipped ? fm.home : fm.away)?.longName ?? (flipped ? fm.home : fm.away)?.name;
    const homeScore = flipped ? st.away_score : st.home_score;
    const awayScore = flipped ? st.home_score : st.away_score;

    liveRows.push({
      match_id:   fixtureId,
      fotmob_id:  Number(fm.id),
      home_team:  homeName,
      away_team:  awayName,
      status:     st.status,
      minute:     st.minute,
      home_score: homeScore,
      away_score: awayScore,
      kickoff:    st.kickoff,
      updated_at: new Date().toISOString(),
    });

    if (st.status === "LIVE" || st.status === "HT") liveCount++;

    // Finished → feed the existing results/scoring pipeline
    if (fm.status?.finished && homeScore != null && awayScore != null) {
      resultRows.push({
        match_id:   fixtureId,
        home_score: homeScore,
        away_score: awayScore,
        result:     homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw",
        source:     "api",
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`  ${fixtureId}  ${homeName} ${homeScore ?? "-"}–${awayScore ?? "-"} ${awayName}  [${st.status}${st.minute ? " " + st.minute : ""}]`);
  }

  await sbUpsert("live_matches", liveRows, "match_id");
  await sbUpsert("match_results", resultRows, "match_id");

  // Events for every started match today (a handful of detail calls at most)
  for (const { fixtureId, fm, flipped } of mapped) {
    if (!fm.status?.started) continue;
    try {
      const detail = await fotmobGet(`/matchDetails?matchId=${fm.id}`);
      const events = extractEvents(fixtureId, detail, flipped);
      await sbUpsert("match_events", events, "match_id,seq");
      console.log(`  ${fixtureId}  ↳ ${events.length} events`);
    } catch (err) {
      console.warn(`  ⚠️  events failed for ${fixtureId}: ${err.message}`);
    }
  }

  return { liveCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log(`⚽ Live feed poller ${DRY ? "(dry run) " : ""}${WATCH ? "— watch mode" : "— single pass"}`);

if (WATCH) {
  // Poll every 60s while matches are live, every 5 min otherwise
  for (;;) {
    try {
      const { liveCount } = await pollOnce();
      const wait = liveCount > 0 ? 60_000 : 300_000;
      console.log(`  …sleeping ${wait / 1000}s (${liveCount} live)\n`);
      await sleep(wait);
    } catch (err) {
      console.error(`  ❌ cycle failed: ${err.message} — retrying in 60s`);
      await sleep(60_000);
    }
  }
} else {
  await pollOnce();
  console.log("✅ Done.");
}
