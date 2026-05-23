"""
train_model.py — Logistic Regression trainer for WC 2026 match predictions
===========================================================================

Reads the Kaggle international football results CSV, builds rolling features
for every historical match between World Cup 2026 teams, trains a logistic
regression model, then writes the learned weights to:

    src/data/model_weights.json

Those weights are imported by src/utils/Predictions.js and used immediately
in the app — no other code changes required.

Usage
-----
    pip install -r scripts/requirements.txt
    python scripts/train_model.py

CSV source (place in ~/Downloads/archive/):
    results.csv   — all international match results 1872–2026 (Kaggle)
    https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017

Features trained
----------------
    elo_diff       (home running-ELO − away running-ELO) / 100
    form_diff      home weighted-form − away weighted-form        [-1, +1]
    h2h_centered   home H2H win-rate − 0.5                        [-0.5, +0.5]
    atk_diff       home rolling avgGoalsFor − away                [goals/game]
    def_diff       away rolling avgGoalsAgainst − home            [goals/game]

Target
------
    1 = home team wins the match
    0 = away team wins the match
    (draws are excluded — keeps the binary classifier well-calibrated)
"""

import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

# ── Dependency check ──────────────────────────────────────────────────────────

try:
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score
    from sklearn.preprocessing import StandardScaler
except ImportError:
    print("Missing dependencies. Run:  pip3 install -r scripts/requirements.txt")
    sys.exit(1)

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT    = Path(__file__).resolve().parent.parent
DATA    = ROOT / "src" / "data"
CSV_DIR = Path.home() / "Downloads" / "archive"
CSV     = CSV_DIR / "results.csv"

if not CSV.exists():
    print(f"results.csv not found at {CSV}")
    print("Download from: https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017")
    print("Extract the archive into ~/Downloads/archive/")
    sys.exit(1)

# ── Load app data ─────────────────────────────────────────────────────────────

elo_data = json.loads((DATA / "elo_ratings.json").read_text())
ELO_CURRENT = {k: v for k, v in elo_data.items() if not k.startswith("_")}
WC_TEAMS    = set(ELO_CURRENT.keys())

# ── Team name normalisation ───────────────────────────────────────────────────
# Maps Kaggle dataset names → app names (same as process_kaggle_stats.mjs)

NAME_MAP = {
    "United States":  "USA",
    "Czech Republic": "Czechia",
    "Turkey":         "Türkiye",
    "DR Congo":       "DR Congo",
    "Congo DR":       "DR Congo",
    "Ivory Coast":    "Ivory Coast",
}

def normalise(name):
    return NAME_MAP.get(name.strip(), name.strip())

# ── ELO engine ────────────────────────────────────────────────────────────────
# Simple Elo updated from every result so we have a pre-match rating for each
# historical fixture rather than using only the current FIFA points.

ELO_BASE = 1500
ELO_K    = 32
ELO_D    = 400

running_elo = defaultdict(lambda: ELO_BASE)

def elo_expected(ra, rb):
    return 1.0 / (1.0 + 10 ** ((rb - ra) / ELO_D))

def update_elo(home, away, result):
    """result: 'home' | 'away' | 'draw'"""
    ea = elo_expected(running_elo[home], running_elo[away])
    eb = elo_expected(running_elo[away], running_elo[home])
    sa = 1.0 if result == "home" else (0.5 if result == "draw" else 0.0)
    sb = 1.0 - sa
    running_elo[home] += ELO_K * (sa - ea)
    running_elo[away] += ELO_K * (sb - eb)

# ── Rolling buffers ───────────────────────────────────────────────────────────
# Each team keeps a sliding window of its last N match outcomes / goals.

WINDOW = 15  # matches to consider for form and goal averages

recent_outcomes  = defaultdict(list)   # 1.0=win, 0.5=draw, 0.0=loss
recent_goals_for = defaultdict(list)
recent_goals_ag  = defaultdict(list)

def _push(buf, val, maxlen=WINDOW):
    buf.append(val)
    if len(buf) > maxlen:
        buf.pop(0)

def weighted_form(outcomes):
    """Exponentially weighted win rate: most recent game has highest weight."""
    if not outcomes:
        return 0.5
    total, weight = 0.0, 0.0
    for i, o in enumerate(outcomes):
        w = i + 1          # index 0 = oldest, last index = most recent
        total  += w * o
        weight += w
    return total / weight

def rolling_avg(values):
    return sum(values) / len(values) if values else 1.35

# ── H2H tracker ───────────────────────────────────────────────────────────────

h2h_record = defaultdict(lambda: {"hw": 0, "aw": 0, "d": 0})

def h2h_key(a, b):
    return (min(a, b), max(a, b))

def h2h_home_win_rate(home, away):
    k   = h2h_key(home, away)
    rec = h2h_record[k]
    total = rec["hw"] + rec["aw"] + rec["d"]
    if total < 2:
        return 0.5
    # Which role is 'home' in this key ordering?
    wins = rec["hw"] if home <= away else rec["aw"]
    return wins / total

def update_h2h(home, away, result):
    k = h2h_key(home, away)
    if result == "home":
        if home <= away: h2h_record[k]["hw"] += 1
        else:            h2h_record[k]["aw"] += 1
    elif result == "away":
        if home <= away: h2h_record[k]["aw"] += 1
        else:            h2h_record[k]["hw"] += 1
    else:
        h2h_record[k]["d"] += 1

# ── Process CSV ───────────────────────────────────────────────────────────────

print(f"Loading {CSV} …")

rows = []
with open(CSV, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

rows.sort(key=lambda r: r.get("date", ""))
print(f"  {len(rows):,} total matches\n")

CUTOFF   = "2000-01-01"   # only use post-2000 data; pre-2000 squads/tactics too stale
X_rows   = []
y_rows   = []
skipped  = 0
included = 0

for row in rows:
    date     = row.get("date", "")
    home_raw = row.get("home_team", "")
    away_raw = row.get("away_team", "")

    try:
        hs = int(float(row.get("home_score", 0) or 0))
        as_ = int(float(row.get("away_score", 0) or 0))
    except (ValueError, TypeError):
        continue

    home = normalise(home_raw)
    away = normalise(away_raw)

    result = "home" if hs > as_ else ("away" if as_ > hs else "draw")

    # ── Record features BEFORE updating state ────────────────────────────────
    if date >= CUTOFF and home in WC_TEAMS and away in WC_TEAMS and result != "draw":
        elo_diff     = (running_elo[home] - running_elo[away]) / 100
        form_diff    = weighted_form(recent_outcomes[home]) - weighted_form(recent_outcomes[away])
        h2h_centered = h2h_home_win_rate(home, away) - 0.5
        atk_diff     = rolling_avg(recent_goals_for[home]) - rolling_avg(recent_goals_for[away])
        def_diff     = rolling_avg(recent_goals_ag[away])  - rolling_avg(recent_goals_ag[home])

        X_rows.append([elo_diff, form_diff, h2h_centered, atk_diff, def_diff])
        y_rows.append(1 if result == "home" else 0)
        included += 1
    else:
        skipped += 1

    # ── Update rolling state AFTER recording features ─────────────────────────
    home_out = 1.0 if result == "home" else (0.5 if result == "draw" else 0.0)
    away_out = 1.0 if result == "away" else (0.5 if result == "draw" else 0.0)

    _push(recent_outcomes[home],  home_out)
    _push(recent_outcomes[away],  away_out)
    _push(recent_goals_for[home], hs)
    _push(recent_goals_for[away], as_)
    _push(recent_goals_ag[home],  as_)
    _push(recent_goals_ag[away],  hs)

    update_h2h(home, away, result)
    update_elo(home, away, result)

print(f"Training set: {included:,} decisive WC-team matches (2000-present)")
print(f"Excluded:     {skipped:,}  (draws, non-WC teams, pre-2000)\n")

if included < 100:
    print("⚠  Too few training samples — check that results.csv is the full Kaggle dataset.")
    sys.exit(1)

# ── Train logistic regression ─────────────────────────────────────────────────

X = np.array(X_rows)
y = np.array(y_rows)

scaler   = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
model.fit(X_scaled, y)

cv_scores = cross_val_score(model, X_scaled, y, cv=5, scoring="accuracy")
print(f"5-fold CV accuracy:  {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
print(f"Baseline (majority): {max(y.mean(), 1-y.mean()):.3f}\n")

# ── Bake the scaler into the weights so JS needs no extra maths ───────────────
# JS formula:  z = intercept_eff + sum(coef_eff[i] * raw_feature[i])
# Derivation:  z = b + w·((x - μ) / σ)  =  (b - w·μ/σ) + (w/σ)·x

raw_coef  = model.coef_[0]
raw_inter = model.intercept_[0]
means     = scaler.mean_
scales    = scaler.scale_

effective_intercept = float(raw_inter - np.sum(raw_coef * means / scales))
effective_coefs     = {
    name: float(raw_coef[i] / scales[i])
    for i, name in enumerate(["elo_diff", "form_diff", "h2h_centered", "atk_diff", "def_diff"])
}

# ── Write output ──────────────────────────────────────────────────────────────

output = {
    "_trained":     True,
    "_cv_accuracy": round(float(cv_scores.mean()), 4),
    "_samples":     included,
    "_note":        "Generated by scripts/train_model.py — re-run to update",
    "_features": [
        "elo_diff       — (home running-ELO − away running-ELO) / 100",
        "form_diff      — home weighted-form − away weighted-form  [-1,+1]",
        "h2h_centered   — home H2H win-rate − 0.5",
        "atk_diff       — home rolling avgGoalsFor − away",
        "def_diff       — away rolling avgGoalsAgainst − home",
    ],
    "_formula": "P(home win) = sigmoid(intercept + w1*elo_diff + w2*form_diff + w3*h2h_centered + w4*atk_diff + w5*def_diff)",
    "intercept":    effective_intercept,
    **effective_coefs,
}

out_path = DATA / "model_weights.json"
out_path.write_text(json.dumps(output, indent=2))

print(f"✅  Weights written to {out_path.relative_to(ROOT)}\n")
print("Learned weights:")
print(f"  intercept      {effective_intercept:+.4f}")
for k, v in effective_coefs.items():
    print(f"  {k:<15} {v:+.4f}")

print("\nRestart your dev server (`npm run dev`) to pick up the new weights.")
