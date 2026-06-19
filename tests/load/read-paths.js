/**
 * k6 load test — read paths
 *
 * Exercises the traffic a real visitor generates: the static site (Vercel CDN)
 * and the public, RLS-guarded Supabase read endpoints the app polls on the
 * Schedule / Leaderboard pages. It is deliberately READ-ONLY — it never writes,
 * authenticates, or calls FotMob.
 *
 * ── Install k6 ────────────────────────────────────────────────────────────────
 *   macOS:  brew install k6      (or: https://k6.io/docs/get-started/installation)
 *
 * ── Run ───────────────────────────────────────────────────────────────────────
 *   SITE_URL=https://your-app.vercel.app \
 *   SUPABASE_URL=https://efrhtycodarydbkogwue.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   k6 run tests/load/read-paths.js
 *
 *   Quick smoke (10 VUs, 30s):   k6 run --vus 10 --duration 30s tests/load/read-paths.js
 *
 * ⚠️  PRODUCTION SAFETY
 *   This hits whatever SUPABASE_URL/SITE_URL you point it at. Prefer a staging
 *   Supabase project. If you must run against production, do it off-peak, start
 *   small, and watch the Supabase dashboard (it counts against your plan's
 *   connection/egress limits). The anon key is public, but load is still load.
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate } from "k6/metrics";

const SITE_URL = __ENV.SITE_URL || "";                 // deployed Vercel URL (optional)
const SUPABASE_URL = __ENV.SUPABASE_URL || "";         // https://<ref>.supabase.co
const ANON = __ENV.SUPABASE_ANON_KEY || "";            // public anon key

if (!SUPABASE_URL || !ANON) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY env vars (see file header).");
}

const errors = new Rate("custom_errors");

// Load profile: ramp 0→50 VUs, hold, ramp down. Tune to your expected peak.
export const options = {
  stages: [
    { duration: "30s", target: 20 },   // warm up
    { duration: "1m",  target: 50 },   // sustained load
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],   // 95% of requests under 800ms
    http_req_failed:   ["rate<0.01"],   // <1% transport failures
    custom_errors:     ["rate<0.02"],   // <2% unexpected (non-2xx) responses
  },
};

const sb = (path) =>
  http.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    tags: { name: path.split("?")[0] },
  });

function ok(res, label) {
  const pass = check(res, { [`${label}: 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  errors.add(!pass);
  return pass;
}

export default function () {
  // 1. Live feed — what the Schedule page polls / subscribes to (public per RLS)
  group("live feed", () => {
    ok(sb("live_matches?select=*"), "live_matches");
    ok(sb("match_events?select=match_id,type,minute&order=seq&limit=100"), "match_events");
    ok(sb("match_results?select=*"), "match_results");
  });

  // 2. Leaderboard read (public profiles)
  group("leaderboard", () => {
    ok(sb("profiles?select=username,current_streak,best_streak&order=best_streak.desc&limit=50"), "profiles");
  });

  // 3. Static site (Vercel CDN) — optional, only if SITE_URL provided
  if (SITE_URL) {
    group("site", () => {
      ok(http.get(SITE_URL, { tags: { name: "site_root" } }), "site_root");
    });
  }

  sleep(Math.random() * 2 + 1); // 1–3s think time between iterations
}
