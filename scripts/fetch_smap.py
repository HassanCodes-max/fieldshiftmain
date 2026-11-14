"""Fetch NASA SMAP Enhanced L3 (SPL3SMP_E.006) soil moisture for one point via NASA AppEEARS.

Requires a free NASA Earthdata login (https://urs.earthdata.nasa.gov).

    python -m scripts.fetch_smap --lat 31.30 --lon 73.25 [--start 2015-04-01] [--end 2025-12-31]

Credentials are read from EARTHDATA_USERNAME / EARTHDATA_PASSWORD or asked interactively;
they are never written to disk.
"""
from __future__ import annotations

import argparse
import datetime as dt
import getpass
import io
import os
import re
import sys
import time

import pandas as pd
import requests

from src import data_fetch as F

API = "https://appeears.earthdatacloud.nasa.gov/api"
PRODUCT = "SPL3SMP_E.006"


def login() -> str:
    user = os.environ.get("EARTHDATA_USERNAME") or input("Earthdata username: ")
    pwd = os.environ.get("EARTHDATA_PASSWORD") or getpass.getpass("Earthdata password: ")
    r = requests.post(f"{API}/login", auth=(user, pwd), timeout=60)
    r.raise_for_status()
    return r.json()["token"]


def pick_layers(token: str) -> list[str]:
    r = requests.get(f"{API}/product/{PRODUCT}", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    r.raise_for_status()
    names = list(r.json().keys())
    chosen = [n for n in names if re.search(r"(AM|PM)_soil_moisture(_pm)?$", n)]
    if not chosen:
        print("Could not find soil-moisture layers automatically. Available layers:\n  " + "\n  ".join(names))
        sys.exit(1)
    return chosen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--start", default="2015-04-01")
    ap.add_argument("--end", default=(dt.date.today() - dt.timedelta(days=30)).isoformat())
    a = ap.parse_args()

    token = login()
    hdr = {"Authorization": f"Bearer {token}"}
    layers = pick_layers(token)
    print("Layers:", layers)
    s, e = dt.date.fromisoformat(a.start), dt.date.fromisoformat(a.end)
    task = {
        "task_type": "point",
        "task_name": f"fieldshift_smap_{a.lat:.2f}_{a.lon:.2f}",
        "params": {
            "dates": [{"startDate": s.strftime("%m-%d-%Y"), "endDate": e.strftime("%m-%d-%Y")}],
            "layers": [{"product": PRODUCT, "layer": lyr} for lyr in layers],
            "coordinates": [{"latitude": a.lat, "longitude": a.lon, "id": "farm"}],
        },
    }
    r = requests.post(f"{API}/task", json=task, headers=hdr, timeout=60)
    r.raise_for_status()
    tid = r.json()["task_id"]
    print("Submitted AppEEARS task", tid, "- this usually takes 5–30 minutes.")
    while True:
        st = requests.get(f"{API}/task/{tid}", headers=hdr, timeout=60).json().get("status")
        print(f"  {dt.datetime.now():%H:%M:%S} status: {st}")
        if st == "done":
            break
        if st in ("error", "expired"):
            sys.exit(f"Task failed: {st}")
        time.sleep(30)
    files = requests.get(f"{API}/bundle/{tid}", headers=hdr, timeout=60).json()["files"]
    csvs = [f for f in files if f["file_name"].endswith(".csv") and "results" in f["file_name"].lower()] \
        or [f for f in files if f["file_name"].endswith(".csv")]
    frames = []
    for f in csvs:
        raw = requests.get(f"{API}/bundle/{tid}/{f['file_id']}", headers=hdr, timeout=300).content
        frames.append(pd.read_csv(io.BytesIO(raw)))
    df = pd.concat(frames)
    out = F.smap_from_appeears(df)
    path = F.smap_path(a.lat, a.lon)
    out.to_csv(path, index=False)
    print(f"Saved {len(out)} days to {path}")


if __name__ == "__main__":
    main()
