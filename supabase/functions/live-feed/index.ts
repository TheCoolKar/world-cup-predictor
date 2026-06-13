/**
 * Supabase Edge Function: live-feed
 *
 * Minute-by-minute World Cup live feed. Invoked by pg_cron (see
 * supabase/migrations/008_live_feed_cron.sql) every minute during match hours.
 * Each invocation:
 *   1. Pulls today's World Cup matches from FotMob (league 77)
 *   2. Maps them to app fixture ids (A1–L6 by team names; M73–M104 knockouts
 *      by date + kickoff order)
 *   3. Upserts live_matches (status / minute / score)
 *   4. For started matches, upserts match_events (goals, cards, subs)
 *   5. On full-time, upserts the final score into match_results so pick
 *      scoring updates automatically (source: "api")
 *
 * Clients receive every change instantly via Supabase Realtime.
 *
 * This is the TypeScript/Deno port of scripts/fetchLiveFeed.mjs — keep the two
 * in sync if FotMob's shape changes. The Node script remains handy for local
 * dry-runs (`npm run live-feed-once -- --dry`).
 *
 * Env (auto-injected by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Env (set via `supabase secrets set`): CRON_SECRET — shared secret the cron
 *   job must present in the `x-cron-secret` header.
 *
 * Deploy: supabase functions deploy live-feed --no-verify-jwt
 */

import fixtures from "./fixtures.json" with { type: "json" };

const FOTMOB = "https://www.fotmob.com/api/data";
const WC_LEAGUE = 77;
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type Fixture = { id: string; group: string; home: string; away: string; date: string };

// Official FIFA 2026 knockout schedule (date-ordered; mirrors KO_SCHEDULE in the app).
const KO_SCHEDULE: { id: string; date: string }[] = [
  { id: "M73", date: "2026-06-28" }, { id: "M74", date: "2026-06-28" },
  { id: "M75", date: "2026-06-29" }, { id: "M76", date: "2026-06-29" },
  { id: "M77", date: "2026-06-30" }, { id: "M78", date: "2026-06-30" },
  { id: "M79", date: "2026-07-01" }, { id: "M80", date: "2026-07-01" },
  { id: "M81", date: "2026-07-02" }, { id: "M82", date: "2026-07-02" },
  { id: "M83", date: "2026-07-03" }, { id: "M84", date: "2026-07-03" },
  { id: "M85", date: "2026-07-04" }, { id: "M86", date: "2026-07-04" },
  { id: "M87", date: "2026-07-05" }, { id: "M88", date: "2026-07-05" },
  { id: "M89", date: "2026-07-06" }, { id: "M90", date: "2026-07-06" },
  { id: "M91", date: "2026-07-07" }, { id: "M92", date: "2026-07-07" },
  { id: "M93", date: "2026-07-08" }, { id: "M94", date: "2026-07-08" },
  { id: "M95", date: "2026-07-09" }, { id: "M96", date: "2026-07-09" },
  { id: "M97", date: "2026-07-11" }, { id: "M98", date: "2026-07-11" },
  { id: "M99", date: "2026-07-12" }, { id: "M100", date: "2026-07-12" },
  { id: "M101", date: "2026-07-14" }, { id: "M102", date: "2026-07-15" },
  { id: "M104", date: "2026-07-19" },
];

const ALIASES: Record<string, string> = {
  "bosnia and herzegovina": "bosnia",
  "united states": "usa",
  "turkey": "turkiye",
  "korea republic": "south korea",
  "ir iran": "iran",
  "cote d'ivoire": "ivory coast",
  "cape verde islands": "cape verde",
  "congo dr": "dr congo",
};

function norm(name?: string): string {
  if (!name) return "";
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return ALIASES[n] ?? n;
}

async function fotmobGet(endpoint: string) {
  const res = await fetch(`${FOTMOB}${endpoint}`, { headers: UA });
  if (!res.ok) throw new Error(`FotMob HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

async function fetchWcMatches(yyyymmdd: string) {
  const data = await fotmobGet(`/matches?date=${yyyymmdd}`);
  const out: any[] = [];
  for (const lg of data.leagues ?? []) {
    if (lg.primaryId !== WC_LEAGUE && lg.parentLeagueId !== WC_LEAGUE) continue;
    out.push(...(lg.matches ?? []));
  }
  return out;
}

function shiftIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function etDateOf(utcTime?: string): string | null {
  return utcTime ? new Date(utcTime).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null;
}

function mapToFixtures(fmMatches: any[], isoDate: string) {
  const nearDates = new Set([shiftIso(isoDate, -1), isoDate, shiftIso(isoDate, 1)]);
  const dayGroup = (fixtures as Fixture[]).filter((f) => nearDates.has(f.date));
  const dayKo = KO_SCHEDULE.filter((k) => k.date === isoDate);
  const mapped: { fixtureId: string; fm: any; flipped: boolean }[] = [];
  const unmatched: any[] = [];

  for (const fm of fmMatches) {
    const fmHome = norm(fm.home?.longName ?? fm.home?.name);
    const fmAway = norm(fm.away?.longName ?? fm.away?.name);
    const fx = dayGroup.find((f) =>
      (norm(f.home) === fmHome && norm(f.away) === fmAway) ||
      (norm(f.home) === fmAway && norm(f.away) === fmHome)
    );
    if (fx) mapped.push({ fixtureId: fx.id, fm, flipped: norm(fx.home) !== fmHome });
    else unmatched.push(fm);
  }

  if (dayKo.length && unmatched.length) {
    const sorted = unmatched
      .filter((fm) => etDateOf(fm.status?.utcTime) === isoDate)
      .sort((a, b) => +new Date(a.status?.utcTime ?? 0) - +new Date(b.status?.utcTime ?? 0));
    sorted.slice(0, dayKo.length).forEach((fm, i) => {
      mapped.push({ fixtureId: dayKo[i].id, fm, flipped: false });
    });
  }
  return mapped;
}

function extractState(fm: any) {
  const s = fm.status ?? {};
  let status = "NS";
  if (s.cancelled) status = "CANC";
  else if (s.finished) status = s.reason?.short ?? "FT";
  else if (s.started || s.ongoing) status = s.reason?.short === "HT" ? "HT" : "LIVE";
  return {
    status,
    minute: s.liveTime?.short?.trim() ?? null,
    home_score: typeof fm.home?.score === "number" ? fm.home.score : null,
    away_score: typeof fm.away?.score === "number" ? fm.away.score : null,
    kickoff: s.utcTime ?? null,
  };
}

const EVENT_TYPES = new Set(["Goal", "Card", "Substitution", "Half", "AddedTime"]);

function extractEvents(fixtureId: string, detail: any, flipped: boolean) {
  const raw = detail?.content?.matchFacts?.events?.events ?? [];
  const rows: any[] = [];
  raw.forEach((e: any, seq: number) => {
    if (!EVENT_TYPES.has(e.type)) return;
    let player = e.player?.name ?? null;
    let detailStr: string | null = null;
    if (e.type === "Substitution" && Array.isArray(e.swap) && e.swap.length === 2) {
      player = e.swap[0]?.name ?? null;
      detailStr = `On: ${e.swap[0]?.name ?? "?"} · Off: ${e.swap[1]?.name ?? "?"}`;
    } else if (e.type === "Goal") {
      detailStr = [e.ownGoal ? "Own goal" : null, e.goalDescription ?? null].filter(Boolean).join(" · ") || null;
    }
    rows.push({
      match_id: fixtureId,
      seq,
      minute: typeof e.time === "number" ? e.time : null,
      overload: e.overloadTime || null,
      type: e.type,
      card: e.card ?? null,
      player,
      assist: e.assistStr?.replace(/^assist by /i, "") ?? null,
      detail: detailStr,
      is_home: typeof e.isHome === "boolean" ? (flipped ? !e.isHome : e.isHome) : null,
    });
  });
  return rows;
}

async function sbUpsert(table: string, rows: any[], onConflict: string) {
  if (!rows.length) return;
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

function todayEt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function pollOnce() {
  const isoDate = todayEt();
  const dates = [isoDate, shiftIso(isoDate, 1)].map((d) => d.replaceAll("-", ""));
  const seen = new Set<number>();
  const fmMatches: any[] = [];
  for (const d of dates) {
    for (const m of await fetchWcMatches(d)) {
      if (!seen.has(m.id)) { seen.add(m.id); fmMatches.push(m); }
    }
  }
  if (!fmMatches.length) return { date: isoDate, matches: 0, live: 0 };

  const mapped = mapToFixtures(fmMatches, isoDate);
  const liveRows: any[] = [];
  const resultRows: any[] = [];
  let live = 0;

  for (const { fixtureId, fm, flipped } of mapped) {
    const st = extractState(fm);
    const homeName = (flipped ? fm.away : fm.home)?.longName ?? (flipped ? fm.away : fm.home)?.name;
    const awayName = (flipped ? fm.home : fm.away)?.longName ?? (flipped ? fm.home : fm.away)?.name;
    const homeScore = flipped ? st.away_score : st.home_score;
    const awayScore = flipped ? st.home_score : st.away_score;

    liveRows.push({
      match_id: fixtureId,
      fotmob_id: Number(fm.id),
      home_team: homeName,
      away_team: awayName,
      status: st.status,
      minute: st.minute,
      home_score: homeScore,
      away_score: awayScore,
      kickoff: st.kickoff,
      updated_at: new Date().toISOString(),
    });
    if (st.status === "LIVE" || st.status === "HT") live++;

    if (fm.status?.finished && homeScore != null && awayScore != null) {
      resultRows.push({
        match_id: fixtureId,
        home_score: homeScore,
        away_score: awayScore,
        result: homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw",
        source: "api",
        updated_at: new Date().toISOString(),
      });
    }
  }

  await sbUpsert("live_matches", liveRows, "match_id");
  await sbUpsert("match_results", resultRows, "match_id");

  let eventCount = 0;
  for (const { fixtureId, fm, flipped } of mapped) {
    if (!fm.status?.started) continue;
    try {
      const detail = await fotmobGet(`/matchDetails?matchId=${fm.id}`);
      const events = extractEvents(fixtureId, detail, flipped);
      await sbUpsert("match_events", events, "match_id,seq");
      eventCount += events.length;
    } catch (_) { /* per-match event failure shouldn't abort the cycle */ }
  }

  return { date: isoDate, matches: mapped.length, live, events: eventCount };
}

Deno.serve(async (req) => {
  // Shared-secret guard (function is deployed with --no-verify-jwt)
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const summary = await pollOnce();
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
