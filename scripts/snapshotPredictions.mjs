/**
 * Snapshot AI predictions for matches whose kickoff has already passed.
 *
 * Run with: node scripts/snapshotPredictions.mjs   (or npm run snapshot-predictions)
 *
 * This script must run BEFORE fetch-form in the daily workflow so that the
 * frozen prediction reflects the model state from before the match, not after.
 *
 * Already-snapshotted matches are never overwritten — the file only grows.
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer }  from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const FIXTURES  = path.join(ROOT, "src/data/wc2026_fixtures.json");
const SNAPSHOT  = path.join(ROOT, "src/data/match_predictions_snapshot.json");

// Parse "2026-06-11" + "3:00 PM ET" → UTC Date (EDT = UTC-4)
function parseKickoff(dateStr, timeStr) {
  const clean = timeStr.replace(" ET", "").trim();
  const [timePart, meridiem] = clean.split(" ");
  let [h, m] = timePart.split(":").map(Number);
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 4, m));
}

const fixtures = JSON.parse(fs.readFileSync(FIXTURES, "utf8"));
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
const now      = Date.now();

const toSnapshot = fixtures.filter(
  m => m.home && m.away && parseKickoff(m.date, m.time).getTime() <= now && !(m.id in snapshot)
);

if (toSnapshot.length === 0) {
  console.log("✅ Nothing to snapshot — all kicked-off matches are already frozen.");
  process.exit(0);
}

console.log(`📸 Snapshotting predictions for ${toSnapshot.length} match(es)…`);

const server = await createServer({
  root:     ROOT,
  logLevel: "error",
  server:   { middlewareMode: true },
  appType:  "custom",
});

try {
  const { simulateMatchMonteCarlo } = await server.ssrLoadModule("/src/utils/TournamentSimulator.js");

  for (const m of toSnapshot) {
    const result = simulateMatchMonteCarlo(m.home, m.away, m.id);
    snapshot[m.id] = result;
    console.log(`   ${m.id}  ${m.home} vs ${m.away}  →  ${result.homeWin}% / ${result.draw}% / ${result.awayWin}%`);
  }

  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅ Wrote ${SNAPSHOT}`);
} finally {
  await server.close();
}
