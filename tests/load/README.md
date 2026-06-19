# Load & stress testing

Scaffolding for load testing with [k6](https://k6.io). Currently one read-only
scenario; extend as needed.

## Why this is a scaffold, not "done"
Meaningful load testing needs decisions you (not a script) own:
- **Where to run it** — against a *staging* Supabase project, not production.
- **What "passing" means** — the thresholds in the script are starting guesses;
  set them from your actual SLOs and Supabase plan limits.
- **Realistic traffic shape** — the VU counts/stages are placeholders. Model them
  on expected concurrent users (e.g. a match kickoff spike).

## Setup
```bash
brew install k6        # or see https://k6.io/docs/get-started/installation
```

## Run
```bash
SITE_URL=https://your-app.vercel.app \
SUPABASE_URL=https://efrhtycodarydbkogwue.supabase.co \
SUPABASE_ANON_KEY=eyJ... \
k6 run tests/load/read-paths.js
```
Smoke test: `k6 run --vus 10 --duration 30s tests/load/read-paths.js`

## What it covers
- `live_matches`, `match_events`, `match_results` — the Schedule page's polling/RLS-public reads
- `profiles` — the leaderboard read
- the deployed site root (CDN), if `SITE_URL` is set

## What it deliberately does NOT do
- No writes, no auth, no FotMob calls (would spam an unofficial API + mutate data)
- Does not load-test the `live-feed` edge function (it writes to the DB and calls
  FotMob). If you want to stress that path, point it at a staging project with a
  mocked source first.

## ⚠️ Production caution
This generates real load against whatever you point it at and counts against your
Supabase plan (connections, egress). Prefer staging; if you must use production,
run off-peak, start with a few VUs, and watch the dashboard.

## Backlog (not yet scaffolded)
- **Stress test** — push VUs past expected peak to find the breaking point.
- **Soak test** — hold moderate load for hours to catch leaks.
- **Resilience/chaos** — kill the edge function / simulate FotMob outage and
  verify graceful degradation. Needs infra tooling beyond k6.
