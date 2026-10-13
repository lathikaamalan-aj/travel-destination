"""YOUR PEACE GUIDE - Flask backend with content-based filtering.

Run:  pip install flask pandas scikit-learn  &&  python app.py
"""
from pathlib import Path
import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)
DF = pd.read_csv(Path(__file__).parent / "data" / "destinations.csv").fillna("")

# Questionnaire answer -> value used by the engine -------------------------
BUDGETS = {"b1": (0, 5000), "b2": (5000, 10000), "b3": (10000, 20000),
           "b4": (20000, 50000), "b5": (50000, 200000)}
DAYS = {"d1": (1, 2), "d2": (3, 5), "d3": (6, 7), "d4": (8, 14)}
SEASONS = {"winter", "summer", "monsoon", "spring", "any"}
CATEGORIES = {"nature", "mountains", "beaches", "adventure",
              "historical", "spiritual", "wildlife", "city"}
REGIONS = {"Tamil Nadu", "Kerala", "South India", "North India",
           "Northeast India", "Any"}
LABELS = {"nature": "Nature & Greenery", "mountains": "Mountains & Hill Stations",
          "beaches": "Beaches", "adventure": "Adventure & Trekking",
          "historical": "Historical Places", "spiritual": "Spiritual & Peaceful",
          "wildlife": "Wildlife & Forests", "city": "City Exploration"}


def profile(row):
    """Text 'document' describing one destination (the TF-IDF input)."""
    cat = row["category"]
    # category and season are weighted by repetition
    return f'{cat} {cat} {row["season"]} {row["season"]} {row["region"]} {row["activities"]} {row["description"]}'


def user_query(a):
    """Turn the questionnaire answers into a text document of the same shape."""
    parts = [a["category"]] * 3
    if a["season"] != "any":
        parts += [a["season"]] * 2
    if a["region"] != "Any":
        parts += [a["region"]] * 2
    return " ".join(parts)


def range_fit(value, lo, hi, tolerance):
    """1.0 inside [lo, hi]; fades linearly to 0 outside by `tolerance` fraction."""
    if lo <= value <= hi:
        return 1.0
    gap = lo - value if value < lo else value - hi
    return float(max(0.0, 1 - gap / (tolerance * max(hi, 1))))


def recommend(a, top_n=6):
    # Hybrid content-based score: TF-IDF text similarity + budget + duration fit
    docs = DF.apply(profile, axis=1).tolist()
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    matrix = vec.fit_transform(docs)
    sim = cosine_similarity(vec.transform([user_query(a)]), matrix).ravel()

    b_lo, b_hi = BUDGETS[a["budget"]]
    d_lo, d_hi = DAYS[a["days"]]
    # Cost at or below the user's ceiling is a good match; far above is not.
    budget_fit = np.array([1.0 if b <= b_hi else range_fit(b, b_lo, b_hi, 0.6) for b in DF["budget"]])
    days_fit = np.array([range_fit((d_lo + d_hi) / 2, r.min_days, r.max_days, 1.2)
                         for r in DF.itertuples()])
    score = 0.55 * sim / (sim.max() or 1) + 0.25 * budget_fit + 0.20 * days_fit

    # Region is a hard filter when a specific one is chosen
    mask = np.ones(len(DF), bool)
    if a["region"] != "Any":
        mask = DF["region"].str.contains(a["region"], regex=False).to_numpy().copy()
    # Require some real content/season relevance so nothing random appears
    mask &= (sim > 0) & (budget_fit > 0)

    results = []
    for i in np.argsort(-score):
        if not mask[i] or len(results) >= top_n:
            continue
        r = DF.iloc[i]
        reasons = []
        if a["category"] in r["category"].split():
            reasons.append(f"offers {LABELS[a['category']].lower()}")
        if a["season"] != "any" and a["season"] in r["season"].split():
            reasons.append(f"is best in {a['season']}")
        if budget_fit[i] == 1.0:
            reasons.append(f"fits your budget (about ₹{int(r['budget']):,})")
        if a["region"] != "Any":
            reasons.append(f"is in {a['region']}")
        if days_fit[i] >= 0.99:
            reasons.append("suits your trip length")
        results.append({**row_to_dict(r), "match": int(round(score[i] * 100)),
                        "why": "Matches because it " + ", ".join(reasons) + "." if reasons
                        else "A close overall match to your preferences."})
    return results


def row_to_dict(r):
    return {"name": r["name"], "state": r["state"], "description": r["description"],
            "budget": int(r["budget"]), "season": r["season"].replace(" ", ", ").title(),
            "duration": f'{int(r["min_days"])}-{int(r["max_days"])} days',
            "category": " · ".join(LABELS[c] for c in r["category"].split()),
            "activities": r["activities"], "image": r["image_url"],
            "lat": float(r["lat"]), "lng": float(r["lng"])}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/destinations")
def destinations():
    return jsonify([row_to_dict(r) for _, r in DF.iterrows()])


@app.route("/api/recommend", methods=["POST"])
def api_recommend():
    a = request.get_json(silent=True) or {}
    valid = (a.get("budget") in BUDGETS and a.get("days") in DAYS and a.get("season") in SEASONS
             and a.get("category") in CATEGORIES and a.get("region") in REGIONS)
    if not valid:
        return jsonify({"error": "Please answer all five questions."}), 400
    return jsonify({"method": "content-based (TF-IDF + cosine similarity)", "results": recommend(a)})


if __name__ == "__main__":
    app.run(debug=True)