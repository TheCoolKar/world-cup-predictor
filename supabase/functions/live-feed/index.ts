/**
 * Supabase Edge Function: live-feed
 *
 * Polls FotMob once per invocation (called every minute by pg_cron via pg_net).
 * Writes live scores, match events, and final results to Supabase exactly like
 * scripts/fetchLiveFeed.mjs — same logic, ported to Deno.
 *
 * Env vars (injected automatically by Supabase):
 *   SUPABASE_URL              — project REST endpoint
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS for upserts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import fixtures from "../../../src/data/wc2026_fixtures.json" with { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const FOTMOB    = "https://www.fotmob.com/api/data";
const WC_LEAGUE = 77;
const UA        = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

// ── Knockout schedule (mirrors KO_SCHEDULE in fetchLiveFeed.mjs) ──────────────
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

// ── Team name normalisation ───────────────────────────────────────────────────
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

function norm(name: string | null | undefined): string {
  if (!name) return "";
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return ALIASES[n] ?? n;
}

// ── FotMob helpers ────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function fotmobGet(endpoint: string): Promise<any> {
  const res = await fetch(`${FOTMOB}${endpoint}`, { headers: UA });
  if (!res.ok) throw new Error(`FotMob HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

// deno-lint-ignore no-explicit-any
async function fetchWcMatches(yyyymmdd: string): Promise<any[]> {
  const data = await fotmobGet(`/matches?date=${yyyymmdd}`);
  const out = [];
  for (const lg of data.leagues ?? []) {
    if (lg.primaryId !== WC_LEAGUE && lg.parentLeagueId !== WC_LEAGUE) continue;
    out.push(...(lg.matches ?? []));
  }
  return out;
}

// ── Fixture mapping ───────────────────────────────────────────────────────────
function shiftIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function etDateOf(utcTime: string | null | undefined): string | null {
  return utcTime
    ? new Date(utcTime).toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    : null;
}

function todayEt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// deno-lint-ignore no-explicit-any
function mapToFixtures(fmMatches: any[], isoDate: string) {
  const nearDates = new Set([shiftIso(isoDate, -1), isoDate, shiftIso(isoDate, 1)]);
  // deno-lint-ignore no-explicit-any
  const dayGroup  = (fixtures as any[]).filter((f: any) => nearDates.has(f.date));
  const dayKo     = KO_SCHEDULE.filter(k => k.date === isoDate);
  // deno-lint-ignore no-explicit-any
  const mapped: { fixtureId: string; fm: any; flipped: boolean }[] = [];
  // deno-lint-ignore no-explicit-any
  const unmatched: any[] = [];

  for (const fm of fmMatches) {
    const fmHome = norm(fm.home?.longName ?? fm.home?.name);
    const fmAway = norm(fm.away?.longName ?? fm.away?.name);
    // deno-lint-ignore no-explicit-any
    const fx = dayGroup.find((f: any) =>
      (norm(f.home) === fmHome && norm(f.away) === fmAway) ||
      (norm(f.home) === fmAway && norm(f.away) === fmHome)
    );
    // deno-lint-ignore no-explicit-any
    if (fx) mapped.push({ fixtureId: (fx as any).id, fm, flipped: norm((fx as any).home) !== fmHome });
    else unmatched.push(fm);
  }

  if (dayKo.length && unmatched.length) {
    const sorted = unmatched
      .filter(fm => etDateOf(fm.status?.utcTime) === isoDate)
      .sort((a, b) => new Date(a.status?.utcTime ?? 0).getTime() - new Date(b.status?.utcTime ?? 0).getTime());
    sorted.slice(0, dayKo.length).forEach((fm, i) => {
      mapped.push({ fixtureId: dayKo[i].id, fm, flipped: false });
    });
  }
  return mapped;
}

// ── State / event extraction ──────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function extractState(fm: any) {
  const s = fm.status ?? {};
  let status = "NS";
  if (s.cancelled)                          status = "CANC";
  else if (s.finished)                      status = s.reason?.short ?? "FT";
  else if (s.started || s.ongoing)          status = s.reason?.short === "HT" ? "HT" : "LIVE";
  return {
    status,
    minute:     s.liveTime?.short?.trim() ?? null,
    home_score: typeof fm.home?.score === "number" ? fm.home.score : null,
    away_score: typeof fm.away?.score === "number" ? fm.away.score : null,
    kickoff:    s.utcTime ?? null,
  };
}

const EVENT_TYPES = new Set(["Goal", "Card", "Substitution", "Half", "AddedTime"]);

// deno-lint-ignore no-explicit-any
function extractEvents(fixtureId: string, detail: any, flipped: boolean) {
  const raw = detail?.content?.matchFacts?.events?.events ?? [];
  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  // deno-lint-ignore no-explicit-any
  raw.forEach((e: any, seq: number) => {
    if (!EVENT_TYPES.has(e.type)) return;
    let player = e.player?.name ?? null;
    let detailStr = null;
    if (e.type === "Substitution" && Array.isArray(e.swap) && e.swap.length === 2) {
      player    = e.swap[0]?.name ?? null;
      detailStr = `On: ${e.swap[0]?.name ?? "?"} · Off: ${e.swap[1]?.name ?? "?"}`;
    } else if (e.type === "Goal") {
      detailStr = [e.ownGoal ? "Own goal" : null, e.goalDescription ?? null].filter(Boolean).join(" · ") || null;
    }
    rows.push({
      match_id: fixtureId, seq,
      minute:   typeof e.time === "number" ? e.time : null,
      overload: e.overloadTime || null,
      type:     e.type, card: e.card ?? null, player,
      assist:   e.assistStr?.replace(/^assist by /i, "") ?? null,
      detail:   detailStr,
      is_home:  typeof e.isHome === "boolean" ? (flipped ? !e.isHome : e.isHome) : null,
    });
  });
  return rows;
}

// ── Supabase upsert ───────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function sbUpsert(table: string, rows: any[], onConflict: string) {
  if (!rows.length) return;
  const { error } = await sb.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

// ── Poll cycle ────────────────────────────────────────────────────────────────
async function pollOnce(): Promise<{ liveCount: number; matchCount: number; message?: string }> {
  const isoDate  = todayEt();
  const dates    = [isoDate, shiftIso(isoDate, 1)].map(d => d.replaceAll("-", ""));
  const seen     = new Set<string>();
  // deno-lint-ignore no-explicit-any
  const fmMatches: any[] = [];
  for (const d of dates) {
    for (const m of await fetchWcMatches(d)) {
      if (!seen.has(m.id)) { seen.add(m.id); fmMatches.push(m); }
    }
  }

  if (!fmMatches.length) {
    return { liveCount: 0, matchCount: 0, message: `No World Cup matches on ${isoDate}` };
  }

  const mapped     = mapToFixtures(fmMatches, isoDate);
  // deno-lint-ignore no-explicit-any
  const liveRows:   any[] = [];
  // deno-lint-ignore no-explicit-any
  const resultRows: any[] = [];
  let liveCount = 0;

  for (const { fixtureId, fm, flipped } of mapped) {
    const st = extractState(fm);
    const homeName  = (flipped ? fm.away : fm.home)?.longName ?? (flipped ? fm.away : fm.home)?.name;
    const awayName  = (flipped ? fm.home : fm.away)?.longName ?? (flipped ? fm.home : fm.away)?.name;
    const homeScore = flipped ? st.away_score : st.home_score;
    const awayScore = flipped ? st.home_score : st.away_score;

    liveRows.push({
      match_id: fixtureId, fotmob_id: Number(fm.id),
      home_team: homeName, away_team: awayName,
      status: st.status, minute: st.minute,
      home_score: homeScore, away_score: awayScore,
      kickoff: st.kickoff, updated_at: new Date().toISOString(),
    });

    if (st.status === "LIVE" || st.status === "HT") liveCount++;

    if (fm.status?.finished && homeScore != null && awayScore != null) {
      resultRows.push({
        match_id: fixtureId, home_score: homeScore, away_score: awayScore,
        result: homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw",
        source: "api", updated_at: new Date().toISOString(),
      });
    }
  }

  await sbUpsert("live_matches",   liveRows,   "match_id");
  await sbUpsert("match_results",  resultRows, "match_id");

  for (const { fixtureId, fm, flipped } of mapped) {
    if (!fm.status?.started) continue;
    try {
      const detail = await fotmobGet(`/matchDetails?matchId=${fm.id}`);
      const events = extractEvents(fixtureId, detail, flipped);
      await sbUpsert("match_events", events, "match_id,seq");
    } catch (err) {
      console.warn(`events failed for ${fixtureId}: ${(err as Error).message}`);
    }
  }

  return { liveCount, matchCount: mapped.length };
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    const result = await pollOnce();
    console.log("live-feed:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("live-feed error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
