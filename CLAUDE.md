# World Cup 2026 Match Predictor

## Project overview
A React web app that predicts 2026 FIFA World Cup match outcomes using ELO ratings and historical match data. Users can view predictions for all 104 matches, make their own picks, and compare scores on a leaderboard.

## Tech stack
- **Frontend:** React + Vite + Tailwind CSS
- **Language:** JavaScript (JSX)
- **Backend/DB:** Supabase (auth + database)
- **Hosting:** Vercel
- **Data:** Kaggle CSV (historical results) + eloratings.net JSON + API-Football (live scores)

## Dev commands
```bash
npm run dev       # start local dev server at http://localhost:5173
npm run build     # production build
npm run preview   # preview production build locally
```

## Project structure
```
world-cup-predictor/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── MatchCard.jsx       # single match prediction card
│   │   ├── GroupTable.jsx      # group stage standings table
│   │   ├── Bracket.jsx         # knockout bracket view
│   │   └── Leaderboard.jsx     # user prediction leaderboard
│   ├── pages/
│   │   ├── Home.jsx            # landing page
│   │   ├── GroupStage.jsx      # all group stage matches
│   │   └── Leaderboard.jsx     # leaderboard page
│   ├── utils/
│   │   └── Predictions.js      # ELO prediction formula
│   ├── data/
│   │   ├── elo_ratings.json    # ELO ratings for all 48 WC teams
│   │   └── wc2026_fixtures.json # all 104 World Cup fixtures
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── CLAUDE.md
├── package.json
└── vite.config.js
```

## Core prediction logic
ELO win probability formula lives in `src/utils/Predictions.js`:
```js
export function predictMatch(eloHome, eloAway) {
  const diff = eloAway - eloHome;
  const homeWinProb = 1 / (1 + Math.pow(10, diff / 400));
  const awayWinProb = 1 - homeWinProb;
  return {
    homeWin: (homeWinProb * 100).toFixed(1) + "%",
    awayWin: (awayWinProb * 100).toFixed(1) + "%",
    favorite: homeWinProb > 0.5 ? "home" : "away"
  };
}
```

## Data sources
- `src/data/elo_ratings.json` — manually compiled from eloratings.net for all 48 WC teams
- `src/data/wc2026_fixtures.json` — all 104 fixtures with group, date, teams, venue
- Kaggle dataset (international results 1872–2024) used for head-to-head and form stats
- API-Football (free tier, 100 req/day) for live scores in Phase 2

## World Cup 2026 format
- 48 teams, 12 groups of 4
- Top 2 from each group + 8 best 3rd-place teams → Round of 32
- Then R16 → QF → SF → Final
- 104 total matches, June 11 – July 19 2026

## Build phases
- **Phase 1 (current):** Static ELO predictions, group stage UI, no backend
- **Phase 2:** Supabase auth + DB, users save predictions, auto-scoring vs real results
- **Phase 3:** Leaderboard, advanced model (form + H2H), full bracket predictor

## Code conventions
- Functional React components only, no class components
- Component files use PascalCase (e.g. `MatchCard.jsx`)
- Utility files use camelCase (e.g. `Predictions.js`)
- Keep components small — if a file exceeds ~100 lines, split it
- No inline styles — use Tailwind classes only
- All data files live in `src/data/`, never fetch external APIs in Phase 1

## Supabase tables (Phase 2)
- `predictions` — user_id, match_id, predicted_winner, score_home, score_away
- `results` — match_id, actual_winner, score_home, score_away
- `leaderboard` — user_id, username, total_points

## Scoring system
| Correct prediction | Points |
|---|---|
| Right winner | +2 |
| Exact score | +5 |
| Correct group advancement | +1 |

### Confidence multiplier & streaks (live implementation)
The shipped scoring (`src/utils/scoring.js`) awards 1 point per correct pick,
multiplied by an optional per-match confidence of ×1/×2/×3 chosen by the user.
Confidence lives in `submissions.confidence` (jsonb keyed by match id); wrong
picks always score 0. Correct-prediction streaks are computed client-side from
picks + results in kickoff order (`calculateStreaks`) and denormalised into
`profiles.current_streak` / `profiles.best_streak`.
Schema changes go in `/supabase/migrations/`.

## Important notes
- Do not commit API keys — use `.env` files and add to `.gitignore`
- Supabase keys go in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- API-Football key goes in `.env` as `VITE_API_FOOTBALL_KEY`
- Always run `npm run build` before pushing to verify no build errors
