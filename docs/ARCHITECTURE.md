# Architecture — World Cup 2026 Predictor

A React SPA on Vercel, backed by Supabase (auth, Postgres + RLS, Realtime, Edge
Functions), with a data pipeline that pulls from FotMob and Polymarket and bakes
JSON into the build. This document is the map of how those pieces fit together.

## System diagram

```mermaid
flowchart TD
    subgraph Sources["External data sources"]
        FM["FotMob (unofficial API)\nlive scores, squads, player stats, form"]
        PM["Polymarket\nmarket odds"]
        KG["Kaggle / historical\nteam stats, ELO"]
    end

    subgraph Pipeline["Build-time data pipeline (scripts/ + GitHub Actions)"]
        SCR["fetch-* scripts\nform · player-stats · squads · odds"]
        SIM["generateMonteCarlo\n10k tournament sims"]
        JSON["src/data/*.json\n(bundled at build)"]
        SCR --> JSON
        JSON --> SIM --> JSON
    end

    subgraph CI["GitHub Actions"]
        CIW["ci.yml\nlint · test · build (on PR)"]
        DAILY["refresh-daily / refresh-weekly\nrefresh data → commit → redeploy"]
    end

    subgraph Vercel["Vercel (frontend)"]
        APP["React + Vite SPA\nPredictions, Bracket, Leagues,\nSchedule, Teams, Profile"]
    end

    subgraph Supabase["Supabase"]
        AUTH["Auth (JWT)\nemail/pw · magic link · Google"]
        DB[("Postgres + RLS\nprofiles, submissions, leagues,\nmatch_results, live_matches,\nmatch_events, terms_acceptances")]
        RT["Realtime\n(live_matches, match_events)"]
        EF["Edge Function: live-feed\nFotMob → DB (every min via pg_cron)"]
        VAULT["Vault\ncron secret"]
    end

    FM --> SCR
    PM --> SCR
    KG --> JSON
    FM --> EF
    EF --> DB
    DB --> RT
    VAULT --> EF
    JSON --> APP
    DAILY --> JSON
    APP <-->|"supabase-js (anon key + RLS)"| AUTH
    APP <-->|"reads/writes"| DB
    RT -->|"push"| APP
    CIW -.->|"gates merges"| APP
```

## Components

### Frontend (`src/`)
- **React + Vite + Tailwind**, deployed to Vercel (auto-deploy on push to `main`).
- Reads two kinds of data:
  - **Static JSON** (`src/data/*.json`) — predictions model inputs, fixtures,
    ELO, squads, player stats, precomputed Monte Carlo. Bundled at build time, so
    refreshing them requires a rebuild/redeploy (handled by the refresh workflows).
  - **Live data** via `supabase-js` (anon key, gated by RLS) — auth, user
    submissions, leagues, leaderboard, and the live match feed over Realtime.
- Prediction model lives in `src/utils/Predictions.js` (logistic regression +
  squad-strength + recent-form blend) and `src/utils/TournamentSimulator.js`
  (Monte Carlo).

### Supabase
- **Auth** — email/password, magic link, Google OAuth. JWT sessions; expiry
  handled by Supabase.
- **Postgres + RLS** — every table has row-level security. Migrations in
  `supabase/migrations/` (numbered, run via SQL editor or `db push`).
- **Realtime** — `live_matches` and `match_events` are published so clients see
  goals/cards/subs without polling.
- **Edge Function `live-feed`** — Deno port of `scripts/fetchLiveFeed.mjs`,
  invoked every minute during match hours by `pg_cron` (migration `009`),
  authenticated with a shared secret stored in Vault.

### Data pipeline (`scripts/`)
- `fetchRecentForm`, `fetchPlayerStats`, `fetchFotmobSquads`, `buildSquadStrength`,
  `fetch_polymarket_odds`, `generateMonteCarlo` — produce the `src/data/*.json`
  the model consumes.
- Scheduled by `refresh-daily.yml` (form + sim) and `refresh-weekly.yml` (full
  squad/player refresh); each commits updated JSON, which triggers a Vercel
  redeploy.

### CI/CD
- **`ci.yml`** — lint (report-only), test, and production build on every PR.
- **`refresh-*.yml`** — scheduled data refresh.
- **Dependabot** — weekly npm + GitHub Actions updates.

## Key data flows

1. **Predictions (static):** scripts → `src/data/*.json` → bundled → model runs
   in-browser (MatchCard, Bracket).
2. **Live scores (dynamic):** `pg_cron` → `live-feed` edge function → FotMob →
   `live_matches`/`match_events` → Realtime → UI. Final scores also land in
   `match_results`, which feeds pick scoring.
3. **User picks:** browser → `supabase-js` → `submissions` (RLS-guarded;
   `protect_locked_picks` trigger prevents editing kicked-off matches).

## Trust boundaries
- The **anon key** is public (in the bundle) — all client access is constrained
  by **RLS**, not by key secrecy.
- The **service-role key** lives only in the edge function and CI secrets, never
  in the frontend.
- The **FotMob API is unofficial** — the poller/scrapers are the single point to
  fix if its shape changes; the DB schema and UI are source-agnostic.

## Known gaps (see the engineering-hardening backlog)
Load/stress/resilience testing, formal DR/RPO, key-rotation runbook, and
regulatory (GDPR/CCPA) review are tracked but not yet implemented — several
require infrastructure or legal input rather than code.
