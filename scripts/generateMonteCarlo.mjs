`
/**
 * Regenerate the precomputed full-tournament Monte Carlo snapshot.
 *
 * Run with: node scripts/generateMonteCarlo.mjs [N]   (or npm run sim)
 *
 * The Bracket page (src/pages/Bracket.jsx) reads src/data/monte_carlo_10000.json
 * for champion / deep-run odds. That file is a STATIC snapshot, so it must be
 * regenerated whenever the prediction model changes (e.g. new squad-strength
 * feature) — otherwise the bracket odds go stale while the live match cards
 * (which run the model in-browser) move on.
 *
 * Uses Vite's SSR module loader so the simulator's `import x from "*.json"`
 * statements resolve exactly as they do in the app, with no Node JSON-import
 * attribute friction.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const N = Number(process.argv[2]) || 10000;
const OUT = path.join(ROOT, "src/data/monte_carlo_10000.json");

console.log(`🎲 Running ${N.toLocaleString()} tournament simulations…`);

const server = await createServer({
  root: ROOT,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { runMonteCarlo } = await server.ssrLoadModule("/src/utils/TournamentSimulator.js");
  const t0 = Date.now();
  const result = runMonteCarlo(N);
  console.log(`   done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

  const top = Object.entries(result.champion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  console.log("\nChampion odds (top 8):");
  for (const [team, pct] of top) console.log(`   ${team.padEnd(15)} ${pct}%`);
  console.log(`\n✅ Wrote ${OUT}`);
} finally {
  await server.close();
}
