"""
fetch_polymarket_odds.py — Pull live Polymarket odds for WC 2026 matches
========================================================================

Uses the public Polymarket Gamma API (no auth, no API key required).
Fetches all FIFA WC 2026 match events (series_id=11433) and extracts
win probabilities for each team from the binary markets:

    "Will [home] win?" → Yes price  = homeWinProb
    "Will [away] win?" → Yes price  = awayWinProb
    "Will ... draw?"   → Yes price  = drawProb  (stored but not used in blend)

Output: src/data/polymarket_odds.json (keyed by fixture ID)

Usage
-----
    python3 scripts/fetch_polymarket_odds.py

Schedule: Run daily to keep odds fresh.
npm shortcut: npm run fetch-odds
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT     = Path(__file__).resolve().parent.parent
DATA     = ROOT / "src" / "data"
GAMMA    = "https://gamma-api.polymarket.com"
SERIES   = 11433   # FIFA WC 2026 series ID on Polymarket

# ── Team name normalisation ───────────────────────────────────────────────────
# Polymarket uses official FIFA names; we use display names in the app.

POLY_TO_APP: dict[str, str] = {
    "korea republic":              "South Korea",
    "republic of korea":           "South Korea",
    "bosnia and herzegovina":      "Bosnia",
    "united states":               "USA",
    "usa":                         "USA",
    "czech republic":              "Czechia",
    "türkiye":                     "Türkiye",
    "turkey":                      "Türkiye",
    "dr congo":                    "DR Congo",
    "democratic republic of congo":"DR Congo",
    "ivory coast":                 "Ivory Coast",
    "côte d'ivoire":               "Ivory Coast",
    "curaçao":                     "Curaçao",
    "curacao":                     "Curaçao",
    "cabo verde":                  "Cape Verde",
    "ir iran":                     "Iran",
    "iran":                        "Iran",
}

def poly_to_app(name: str) -> str:
    """Convert a Polymarket team name to the app's display name."""
    return POLY_TO_APP.get(name.lower().strip(), name.strip())

# ── HTTP helper ───────────────────────────────────────────────────────────────

def fetch_json(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "wc2026-predictor/1.0",
                    "Accept":     "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** (attempt + 1)
                print(f"  Rate-limited — waiting {wait}s…")
                time.sleep(wait)
            else:
                print(f"  HTTP {e.code}: {url}")
                return None
        except Exception as e:
            print(f"  Error ({attempt+1}/{retries}): {e}")
            time.sleep(1)
    return None

# ── Fetch all WC 2026 events ──────────────────────────────────────────────────

def fetch_all_events() -> list[dict]:
    events: list[dict] = []
    offset = 0
    limit  = 100
    while True:
        url   = f"{GAMMA}/events?series_id={SERIES}&limit={limit}&offset={offset}&active=true"
        batch = fetch_json(url)
        if not isinstance(batch, list) or not batch:
            break
        events.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
        time.sleep(0.3)
    return events

# ── Parse a single event ──────────────────────────────────────────────────────

def parse_event(event: dict) -> Optional[dict]:
    """
    Returns { home, away, homeWinProb, awayWinProb, drawProb, volume, slug }
    or None if the event can't be parsed as a WC match.
    """
    title  = event.get("title", "")
    slug   = event.get("slug", "")
    markets = event.get("markets", [])

    # Title format: "Mexico vs. South Africa"
    if " vs. " not in title and " vs " not in title:
        return None

    sep = " vs. " if " vs. " in title else " vs "
    parts = title.split(sep, 1)
    if len(parts) != 2:
        return None

    home = poly_to_app(parts[0].strip())
    away = poly_to_app(parts[1].strip())

    # Find the three binary markets by their question text
    home_win_prob = None
    away_win_prob = None
    draw_prob     = None
    total_volume  = 0.0

    for m in markets:
        q = (m.get("question") or "").lower()
        prices_raw  = m.get("outcomePrices")
        outcomes_raw = m.get("outcomes")
        try:
            prices   = json.loads(prices_raw)   if isinstance(prices_raw,   str) else prices_raw
            outcomes = json.loads(outcomes_raw)  if isinstance(outcomes_raw, str) else outcomes_raw
            prices   = [float(p) for p in prices]
        except Exception:
            continue

        # Find "Yes" price
        yes_price = None
        if outcomes and prices and len(outcomes) == len(prices):
            for i, o in enumerate(outcomes):
                if isinstance(o, str) and o.lower() == "yes":
                    yes_price = prices[i]
                    break

        if yes_price is None and len(prices) >= 1:
            yes_price = prices[0]  # fallback: first price

        try:
            vol = float(m.get("volume") or 0)
            total_volume += vol
        except Exception:
            pass

        # Match question to outcome type
        if "draw" in q:
            draw_prob = round(yes_price, 4)
        elif home.lower() in q or any(
            alias in q for alias in [home.lower(), parts[0].strip().lower()]
        ):
            home_win_prob = round(yes_price, 4)
        elif away.lower() in q or any(
            alias in q for alias in [away.lower(), parts[1].strip().lower()]
        ):
            away_win_prob = round(yes_price, 4)

    if home_win_prob is None or away_win_prob is None:
        return None

    # Renormalise home/away to sum to 1 (for the binary blend in Predictions.js)
    total = home_win_prob + away_win_prob
    if total <= 0:
        return None

    return {
        "home":        home,
        "away":        away,
        "homeWinProb": round(home_win_prob / total, 4),
        "awayWinProb": round(away_win_prob / total, 4),
        "drawProb":    draw_prob,
        "rawHome":     home_win_prob,
        "rawAway":     away_win_prob,
        "volume":      round(total_volume, 2),
        "slug":        slug,
    }

# ── Match Polymarket events to our fixture IDs ────────────────────────────────

def build_fixture_lookup(fixtures: list[dict]) -> dict[tuple[str, str], str]:
    """Returns { (home, away): fixture_id }"""
    return {(f["home"], f["away"]): f["id"] for f in fixtures}

def find_fixture_id(
    home: str, away: str, lookup: dict[tuple[str, str], str]
) -> Optional[str]:
    """Try direct match, then swap (Polymarket may list teams in different order)."""
    return lookup.get((home, away)) or lookup.get((away, home))

# ── Champion market ───────────────────────────────────────────────────────────

def fetch_champion_odds() -> dict:
    """Fetch outright tournament winner probabilities."""
    url  = f"{GAMMA}/events?slug=2026-fifa-world-cup-winner-595&limit=1"
    data = fetch_json(url)
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        return {}

    markets = data.get("markets", [])
    if not markets:
        return {}

    # The outright market has one outcome per team
    best = max(markets, key=lambda m: float(m.get("volume") or 0), default=None)
    if not best:
        best = markets[0]

    try:
        outcomes = json.loads(best.get("outcomes") or "[]")
        prices   = json.loads(best.get("outcomePrices") or "[]")
        prices   = [float(p) for p in prices]
        if outcomes and prices and len(outcomes) == len(prices):
            return {poly_to_app(o): round(p, 4) for o, p in zip(outcomes, prices) if p > 0.001}
    except Exception:
        pass
    return {}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Polymarket WC 2026 Odds Fetcher")
    print("=" * 60)

    fixtures = json.loads((DATA / "wc2026_fixtures.json").read_text())
    group_fx  = [f for f in fixtures if f.get("group")]
    lookup    = build_fixture_lookup(group_fx)
    print(f"\nTarget: {len(group_fx)} group-stage fixtures\n")

    # ── Fetch events ──────────────────────────────────────────────────────────
    print(f"Fetching events from series {SERIES}…")
    events = fetch_all_events()
    print(f"  Found {len(events)} events\n")

    # ── Match to fixtures ─────────────────────────────────────────────────────
    print("Parsing & matching…")
    output: dict = {}
    matched   = 0
    unmatched = []

    for event in events:
        parsed = parse_event(event)
        if not parsed:
            continue

        fid = find_fixture_id(parsed["home"], parsed["away"], lookup)
        if not fid:
            # try swapped
            fid = find_fixture_id(parsed["away"], parsed["home"], lookup)
            if fid:
                # Polymarket had teams swapped — flip probabilities
                parsed["homeWinProb"], parsed["awayWinProb"] = (
                    parsed["awayWinProb"], parsed["homeWinProb"]
                )
                parsed["rawHome"], parsed["rawAway"] = parsed["rawAway"], parsed["rawHome"]
                parsed["home"], parsed["away"] = parsed["away"], parsed["home"]

        if fid:
            output[fid] = parsed
            matched += 1
            print(
                f"  ✓ {fid:3s}  {parsed['home']:<22} vs {parsed['away']:<22}"
                f"  {parsed['homeWinProb']*100:5.1f}% / {parsed['awayWinProb']*100:5.1f}%"
                f"  vol ${parsed['volume']:,.0f}"
            )
        else:
            unmatched.append(f"{parsed['home']} vs {parsed['away']}")

    # ── Champion market ───────────────────────────────────────────────────────
    print("\nFetching tournament-winner odds…")
    champion = fetch_champion_odds()
    if champion:
        top5 = sorted(champion.items(), key=lambda x: -x[1])[:5]
        print("  Top 5: " + "  ".join(f"{t} {p*100:.1f}%" for t, p in top5))
    else:
        print("  ✗ Not found")

    # ── Save ──────────────────────────────────────────────────────────────────
    result = {
        "_fetched":        datetime.now(timezone.utc).isoformat(),
        "_source":         "polymarket.com — series 11433",
        "_note":           "Run: python3 scripts/fetch_polymarket_odds.py",
        "_matched":        matched,
        "_total_fixtures": len(group_fx),
        "_blend_weight":   "55% market / 45% model in Predictions.js",
        "champion":        champion,
        **output,
    }

    out = DATA / "polymarket_odds.json"
    out.write_text(json.dumps(result, indent=2))

    print(f"\n{'='*60}")
    print(f"✅  {matched}/{len(group_fx)} fixtures matched")
    if unmatched:
        print(f"⚠   Unmatched ({len(unmatched)}): {', '.join(unmatched[:5])}"
              + (f" … +{len(unmatched)-5}" if len(unmatched) > 5 else ""))
    print(f"Saved → {out.relative_to(ROOT)}")
    print("Restart `npm run dev` to use updated odds.\n")

if __name__ == "__main__":
    main()
