"""
Build EA FC 25 player ratings for all 48 World Cup 2026 teams from a Kaggle CSV.

Dataset: https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-25-complete-player-dataset
Download the ZIP, extract it, and place the main players CSV somewhere accessible.

Usage:
    python scripts/scrape_ea_fc_ratings.py --csv ~/Downloads/male_players.csv

If --csv is omitted the script searches common download locations automatically.
"""

import csv
import json
import os
import glob
import argparse
from pathlib import Path

# Map from the nationality strings used in the Kaggle dataset → our team names
NATIONALITY_MAP = {
    "Argentina":        "Argentina",
    "Australia":        "Australia",
    "Belgium":          "Belgium",
    "Brazil":           "Brazil",
    "Cameroon":         "Cameroon",
    "Canada":           "Canada",
    "Chile":            "Chile",
    "Colombia":         "Colombia",
    "Croatia":          "Croatia",
    "Ecuador":          "Ecuador",
    "Egypt":            "Egypt",
    "England":          "England",
    "France":           "France",
    "Germany":          "Germany",
    "Honduras":         "Honduras",
    "Hungary":          "Hungary",
    "IR Iran":          "Iran",
    "Iran":             "Iran",
    "Italy":            "Italy",
    "Ivory Coast":      "Ivory Coast",
    "Côte d'Ivoire":    "Ivory Coast",
    "Japan":            "Japan",
    "Mexico":           "Mexico",
    "Morocco":          "Morocco",
    "Netherlands":      "Netherlands",
    "Holland":          "Netherlands",
    "New Zealand":      "New Zealand",
    "Nigeria":          "Nigeria",
    "Panama":           "Panama",
    "Portugal":         "Portugal",
    "Qatar":            "Qatar",
    "Saudi Arabia":     "Saudi Arabia",
    "Senegal":          "Senegal",
    "Serbia":           "Serbia",
    "Korea Republic":   "South Korea",
    "South Korea":      "South Korea",
    "Spain":            "Spain",
    "Switzerland":      "Switzerland",
    "United States":    "USA",
    "Uruguay":          "Uruguay",
}

WC_TEAMS = set(NATIONALITY_MAP.values())

# Column names for the EAFC26-Men.csv format
COL_NAME        = "Name"
COL_NATIONALITY = "Nation"
COL_OVERALL     = "OVR"
COL_POTENTIAL   = "OVR"   # no separate potential column in this dataset
COL_AGE         = "Age"
COL_POSITION    = "Position"
COL_PACE        = "PAC"
COL_SHOOTING    = "SHO"
COL_PASSING     = "PAS"
COL_DRIBBLING   = "DRI"
COL_DEFENDING   = "DEF"
COL_PHYSICAL    = "PHY"


def find_csv():
    """Search common locations for the EA FC 25 CSV."""
    patterns = [
        str(Path.home() / "Downloads" / "*.csv"),
        str(Path.home() / "Downloads" / "**" / "*.csv"),
        "*.csv",
    ]
    candidates = []
    for pattern in patterns:
        candidates.extend(glob.glob(pattern, recursive=True))

    # Prefer files that look like the EA FC dataset
    keywords = ["male_players", "ea_fc", "fc25", "fc_25", "players"]
    for path in candidates:
        name = os.path.basename(path).lower()
        if any(k in name for k in keywords):
            return path

    # Fall back to any CSV in Downloads
    downloads = str(Path.home() / "Downloads")
    for path in candidates:
        if downloads.lower() in path.lower():
            return path

    return None


def parse_int(val):
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return None


def get_position_group(pos_str):
    if not pos_str:
        return "UNK"
    # CSV may have comma-separated positions like "ST, CF"
    first = pos_str.split(",")[0].strip().upper()
    if first == "GK":
        return "GK"
    if first in ("CB", "LB", "RB", "LWB", "RWB"):
        return "DEF"
    if first in ("CDM", "CM", "CAM", "LM", "RM"):
        return "MID"
    if first in ("LW", "RW", "CF", "ST", "RF", "LF", "SS"):
        return "ATT"
    return "MID"


def aggregate(players):
    if not players:
        return {}
    sorted_p = sorted(players, key=lambda p: p["overall"] or 0, reverse=True)
    top23 = sorted_p[:23]
    top11 = sorted_p[:11]

    def avg(lst, key):
        vals = [p[key] for p in lst if p.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    by_group = {}
    for group in ("GK", "DEF", "MID", "ATT"):
        gp = [p for p in players if p["position_group"] == group]
        by_group[group] = {"count": len(gp), "avg_overall": avg(gp, "overall")}

    return {
        "avg_overall":   avg(players, "overall"),
        "top23_avg":     avg(top23, "overall"),
        "top11_avg":     avg(top11, "overall"),
        "player_count":  len(players),
        "by_position":   by_group,
    }


def process_csv(csv_path):
    teams = {t: [] for t in WC_TEAMS}
    found_cols = set()

    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        found_cols = set(reader.fieldnames or [])

        for row in reader:
            nat = row.get(COL_NATIONALITY, "").strip()
            team = NATIONALITY_MAP.get(nat)
            if not team:
                continue

            position = row.get(COL_POSITION, "")
            player = {
                "name":           row.get(COL_NAME, "").strip(),
                "position":       position.split(",")[0].strip(),
                "position_group": get_position_group(position),
                "age":            parse_int(row.get(COL_AGE)),
                "overall":        parse_int(row.get(COL_OVERALL)),
                "potential":      parse_int(row.get(COL_POTENTIAL)),
                "pace":           parse_int(row.get(COL_PACE)),
                "shooting":       parse_int(row.get(COL_SHOOTING)),
                "passing":        parse_int(row.get(COL_PASSING)),
                "dribbling":      parse_int(row.get(COL_DRIBBLING)),
                "defending":      parse_int(row.get(COL_DEFENDING)),
                "physical":       parse_int(row.get(COL_PHYSICAL)),
            }
            if player["name"] and player["overall"]:
                teams[team].append(player)

    return teams, found_cols


def main():
    parser = argparse.ArgumentParser(description="Build EA FC 25 ratings JSON for WC 2026 teams")
    parser.add_argument("--csv", help="Path to the EA FC 25 players CSV file")
    args = parser.parse_args()

    csv_path = args.csv
    if not csv_path:
        csv_path = find_csv()
        if csv_path:
            print(f"Auto-detected CSV: {csv_path}")
        else:
            print(
                "ERROR: Could not find the EA FC 25 CSV file.\n"
                "Download it from:\n"
                "  https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-25-complete-player-dataset\n"
                "Then run:\n"
                "  python scripts/scrape_ea_fc_ratings.py --csv path/to/male_players.csv"
            )
            return

    if not os.path.exists(csv_path):
        print(f"ERROR: File not found: {csv_path}")
        return

    print(f"Processing {csv_path} ...")
    teams, found_cols = process_csv(csv_path)

    result = {}
    for team in sorted(WC_TEAMS):
        players = teams[team]
        agg = aggregate(players)
        result[team] = {**agg, "players": players}
        status = f"OK {len(players)} players, avg={agg.get('avg_overall', 'N/A')}" if players else "-- no data"
        print(f"  {team:20s} {status}")

    output_path = os.path.join(
        os.path.dirname(__file__), "..", "src", "data", "ea_fc_ratings.json"
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    with_data = sum(1 for v in result.values() if v.get("player_count", 0) > 0)
    print(f"\nDone. Written to {os.path.abspath(output_path)}")
    print(f"Teams with data: {with_data}/{len(result)}")


if __name__ == "__main__":
    main()
