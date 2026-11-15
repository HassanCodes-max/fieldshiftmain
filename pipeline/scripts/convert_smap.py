"""Convert a manually downloaded AppEEARS SPL3SMP_E point CSV into the file Field Shift reads.

    python -m scripts.convert_smap data/raw/<appeears-results>.csv

Latitude/longitude are taken from the file; output is data/raw/smap_<lat>_<lon>.csv.
"""
from __future__ import annotations

import sys

import pandas as pd

from src import data_fetch as F


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for src in sys.argv[1:]:
        df = pd.read_csv(src)
        for (lat, lon), part in df.groupby(["Latitude", "Longitude"]):
            out = F.smap_from_appeears(part)
            path = F.smap_path(lat, lon)
            out.to_csv(path, index=False)
            rec = f", {out['recommended'].mean():.0%} recommended quality" if "recommended" in out else ""
            print(f"{src}: {len(part)} rows -> {len(out)} valid days "
                  f"({out['date'].min():%Y-%m-%d} to {out['date'].max():%Y-%m-%d}{rec}) -> {path}")


if __name__ == "__main__":
    main()
