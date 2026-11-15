"""Download today's wholesale prices from Punjab AMIS (amis.pk) for the Field Shift crops.

    python -m scripts.fetch_amis

Source: the "WholeSale Prices Of Agricultural Commodities (Rs/100Kg)" market ticker on https://www.amis.pk,
published by the Directorate of Agriculture (Economics & Marketing) Punjab. Each run saves one dated snapshot to
data/raw/amis/amis_prices_<date>.csv. Running it on different days builds up a price history.

Prices are WHOLESALE market prices, not farm-gate prices.
"""
from __future__ import annotations

import datetime as dt
import re

import pandas as pd
import requests

from src import config as C

URL = "http://www.amis.pk/"  # AMIS does not serve HTTPS
OUT = C.DATA / "raw" / "amis"
UNIT = "Rs/100 kg (wholesale)"

# AMIS commodity name -> Field Shift crop id
CROP_OF = {
    "Wheat": "wheat",
    "Rice (IRRI)": "rice", "Rice Basmati (385)": "rice", "Rice Basmati Super (New)": "rice",
    "Rice Basmati Super (Old)": "rice", "Rice Kainat (New)": "rice", "Rice Kainat Old": "rice",
    "Paddy (IRRI)": "rice", "Paddy Basmati": "rice", "Paddy Kainat": "rice",
    "Maize": "maize",
    "Moong": "mungbean",
    "Cotton(Phutti)": "cotton", "Seed Cotton(Phutti)": "cotton",
}
MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"


def _text(html: str) -> str:
    t = re.sub(r"<[^>]+>", "|", html)
    t = re.sub(r"(&nbsp;|\s)+", " ", t)
    return re.sub(r"\|[ |]*", "|", t)


def parse(html: str) -> pd.DataFrame:
    t = _text(html)
    m = re.search(rf"(\d{{1,2}} (?:{MONTHS})[a-z]* 20\d\d)", t)
    date = pd.to_datetime(m.group(1)).date() if m else dt.date.today()
    # The ticker is "|City|Item 123 Item 456 ...|City|..."
    starts = list(re.finditer(r"\|([A-Z][A-Za-z .]{2,25})\|(?=[A-Z][^|]* \d)", t))
    rows = []
    for i, s in enumerate(starts):
        block = t[s.end(): starts[i + 1].start() if i + 1 < len(starts) else s.end() + 6000]
        for name, price in re.findall(r"([A-Za-z][^|\d]*?) (\d+(?:\.\d+)?)(?= |\||$)", block):
            name = name.strip()
            if name in CROP_OF:
                rows.append({"commodity": name, "crop": CROP_OF[name], "market": s.group(1).strip(),
                             "date": date, "price": float(price), "unit": UNIT, "source": URL})
    df = pd.DataFrame(rows).drop_duplicates(["commodity", "market", "date"])
    return df


def main():
    r = requests.get(URL, timeout=60, headers={"User-Agent": "FieldShift/1.0 (NASA Space Apps project)"})
    r.raise_for_status()
    df = parse(r.text)
    if df.empty:
        raise SystemExit("No prices found. The AMIS page layout may have changed.")
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"amis_prices_{df['date'].iloc[0]}.csv"
    df.to_csv(path, index=False)
    print(f"Saved {len(df)} prices from {df['market'].nunique()} markets "
          f"({', '.join(sorted(df['crop'].unique()))}) dated {df['date'].iloc[0]} -> {path}")


if __name__ == "__main__":
    main()
