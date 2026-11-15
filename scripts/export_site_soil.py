"""Export soil-health traits per rotation and NASA SRTM slope per district to docs/data/soil.json.

    python -m scripts.export_site_soil
"""
from __future__ import annotations

import json

import pandas as pd

from src import config as C
from src import data_fetch as F
from src import soil_health as SH

OUT = C.ROOT / "docs" / "data" / "soil.json"


def main():
    meta = json.loads((C.ROOT / "docs" / "data" / "meta.json").read_text(encoding="utf-8"))
    traits = SH.load_traits()
    rots = {}
    for rid, crops in meta["rotations"].items():
        # erosion is computed in the browser (needs the farmer's soil and the rotation's bare days)
        p = SH.profile(crops, 0, "loam", False, 0.0, traits, {c: c for c in crops})
        rots[rid] = {"pest": p["pest"], "forage": p["forage"], "nfix": p["n_fixing"], "cover": p["cover"],
                     "deep": p["deep"], "families": p["families"], "whitefly": {"cotton", "mungbean"} <= set(crops),
                     "phalaris": {"rice", "wheat"} <= set(crops) and p["families"] == 1}
    slope = {}
    for r in pd.read_csv(C.KNOWLEDGE / "regions.csv").itertuples():
        s = F.load_srtm(r.lat, r.lon)
        slope[r.region_id] = {"slope": s["slope_pct"], "elev": s["elevation_m"]}
    OUT.write_text(json.dumps({"rotations": rots, "srtm": slope}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
