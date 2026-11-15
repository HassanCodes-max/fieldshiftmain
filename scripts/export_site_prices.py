"""Export the AMIS price snapshots in data/raw/amis/ to docs/data/prices.json for the public website.

    python -m scripts.fetch_amis          # get today's prices
    python -m scripts.export_site_prices  # update the website file
"""
from __future__ import annotations

import glob
import json

import pandas as pd

from src import config as C

OUT = C.ROOT / "docs" / "data" / "prices.json"
# commodity used as the headline price of each crop (first one present wins)
HEADLINE = {"wheat": ["Wheat"], "rice": ["Rice (IRRI)", "Paddy (IRRI)"], "maize": ["Maize"],
            "mungbean": ["Moong"], "cotton": ["Seed Cotton(Phutti)", "Cotton(Phutti)"]}


def main():
    files = sorted(glob.glob(str(C.RAW / "amis" / "amis_prices_*.csv")))
    if not files:
        raise SystemExit("No AMIS snapshots in data/raw/amis/. Run: python -m scripts.fetch_amis")
    d = pd.concat([pd.read_csv(f) for f in files], ignore_index=True).drop_duplicates(["commodity", "market", "date"])
    latest_date = d["date"].max()
    latest = d[d["date"] == latest_date]
    crops, history = {}, []
    for crop, names in HEADLINE.items():
        x = latest[latest["crop"] == crop]
        head = next((n for n in names if n in set(x["commodity"])), None)
        if head is None:
            continue
        h = x[x["commodity"] == head].sort_values("price")
        crops[crop] = {
            "commodity": head, "median": float(h["price"].median()), "min": float(h["price"].min()),
            "max": float(h["price"].max()), "n": int(len(h)),
            "markets": [{"m": r.market, "p": float(r.price)} for r in h.itertuples()],
            "varieties": [{"c": c, "median": float(g["price"].median()), "n": int(len(g))}
                          for c, g in x.groupby("commodity") if c != head],
        }
        for dt, g in d[d["commodity"] == head].groupby("date"):
            history.append({"date": dt, "crop": crop, "median": float(g["price"].median())})
    out = {"date": latest_date, "unit": "Rs/100 kg", "kind": "wholesale", "source": "http://www.amis.pk",
           "markets": int(latest["market"].nunique()), "snapshots": int(d["date"].nunique()),
           "crops": crops, "history": history}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({len(crops)} crops, {out['markets']} markets, date {latest_date})")


if __name__ == "__main__":
    main()
