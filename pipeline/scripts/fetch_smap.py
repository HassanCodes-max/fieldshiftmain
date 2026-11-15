"""Fetch NASA SMAP Enhanced L3 (SPL3SMP_E.006) soil moisture for points via NASA AppEEARS.

Requires a free NASA Earthdata login (https://urs.earthdata.nasa.gov).

    python -m scripts.fetch_smap --lat 31.30 --lon 73.25 [--start 2015-04-01] [--end 2025-12-31]
    python -m scripts.fetch_smap --presets            # every preset region that has no SMAP file yet
    python -m scripts.fetch_smap --presets --refresh  # every preset region

All points go into ONE AppEEARS point request, which usually finishes in 5–30 minutes.
Credentials: EARTHDATA_USERNAME / EARTHDATA_PASSWORD, ~/.netrc (_netrc on Windows) or a prompt;
they are never written to disk. Output: data/raw/smap_<lat>_<lon>.csv per point.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import re
import sys
import time

import pandas as pd
import requests

from src import data_fetch as F
from src.rotation_engine import load_regions

from . import earthdata_auth as EA

API = "https://appeears.earthdatacloud.nasa.gov/api"
PRODUCT = "SPL3SMP_E.006"


def _req(method: str, url: str, tries: int = 10, **kw) -> requests.Response:
    """requests call that survives short network outages (AppEEARS jobs run for many minutes)."""
    for k in range(tries):
        try:
            r = requests.request(method, url, timeout=kw.pop("timeout", 120), **kw)
            if r.status_code < 500:
                return r
        except (requests.ConnectionError, requests.Timeout):
            if k == tries - 1:
                raise
        time.sleep(min(120, 5 * 2 ** k))  # ~15 min in total: rides out short network outages
    return r


def login() -> str:
    r = requests.post(f"{API}/login", auth=EA.credentials(), timeout=60)
    if r.status_code in (401, 403):
        sys.exit("ERROR: AppEEARS rejected the Earthdata username/password.")
    r.raise_for_status()
    return r.json()["token"]


def pick_layers(token: str) -> list[str]:
    r = requests.get(f"{API}/product/{PRODUCT}", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    r.raise_for_status()
    names = list(r.json().keys())
    chosen = [n for n in names if re.search(r"(AM|PM)_(soil_moisture(_pm)?|retrieval_qual_flag(_pm)?)$", n)]
    if not any("soil_moisture" in n for n in chosen):
        print("Could not find soil-moisture layers automatically. Available layers:\n  " + "\n  ".join(names))
        sys.exit(1)
    return chosen


def save_points(df: pd.DataFrame, points: list[tuple[float, float]]) -> list[str]:
    """Split an AppEEARS results table into one Field Shift SMAP file per requested point."""
    saved = []
    for lat, lon in points:
        part = df[(df["Latitude"].round(2) == round(lat, 2)) & (df["Longitude"].round(2) == round(lon, 2))]
        if part.empty:
            print(f"  no rows returned for {lat:.2f}, {lon:.2f}")
            continue
        out = F.smap_from_appeears(part)
        path = F.smap_path(lat, lon)
        out.to_csv(path, index=False)
        rec = f", {out['recommended'].mean():.0%} recommended quality" if "recommended" in out else ""
        print(f"  {lat:.2f}, {lon:.2f}: {len(out)} valid days{rec} -> {path}")
        saved.append(str(path))
    return saved


def run(points: list[tuple[float, float]], start: dt.date, end: dt.date, poll_s: int = 30) -> list[str]:
    token = login()
    hdr = {"Authorization": f"Bearer {token}"}
    layers = pick_layers(token)
    print("Layers:", ", ".join(layers))
    task = {
        "task_type": "point",
        "task_name": f"fieldshift_smap_{dt.datetime.now():%Y%m%d_%H%M}",
        "params": {
            "dates": [{"startDate": start.strftime("%m-%d-%Y"), "endDate": end.strftime("%m-%d-%Y")}],
            "layers": [{"product": PRODUCT, "layer": lyr} for lyr in layers],
            "coordinates": [{"latitude": lat, "longitude": lon, "id": f"p{i}", "category": "fieldshift"}
                            for i, (lat, lon) in enumerate(points)],
        },
    }
    r = _req("POST", f"{API}/task", json=task, headers=hdr)
    r.raise_for_status()
    tid = r.json()["task_id"]
    print(f"Submitted AppEEARS task {tid} for {len(points)} point(s) - this usually takes 5–30 minutes.")
    print(f"(If this window is closed, resume with: python -m scripts.fetch_smap --presets --task {tid})")
    return collect(tid, hdr, points, poll_s)


def collect(tid: str, hdr: dict, points: list[tuple[float, float]], poll_s: int = 30) -> list[str]:
    """Wait for an AppEEARS task and save its results (also used to resume a task by id)."""
    while True:
        st = _req("GET", f"{API}/task/{tid}", headers=hdr).json().get("status")
        print(f"  {dt.datetime.now():%H:%M:%S} status: {st}")
        if st == "done":
            break
        if st in ("error", "expired"):
            sys.exit(f"Task failed: {st}")
        time.sleep(poll_s)
    files = _req("GET", f"{API}/bundle/{tid}", headers=hdr).json()["files"]
    csvs = [f for f in files if f["file_name"].endswith(".csv") and "results" in f["file_name"].lower()] \
        or [f for f in files if f["file_name"].endswith(".csv")]
    frames = []
    for f in csvs:
        raw = _req("GET", f"{API}/bundle/{tid}/{f['file_id']}", headers=hdr, timeout=300).content
        frames.append(pd.read_csv(io.BytesIO(raw)))
    return save_points(pd.concat(frames), points)


def preset_points(refresh: bool) -> list[tuple[float, float]]:
    pts = [(float(r["lat"]), float(r["lon"])) for _, r in load_regions().iterrows()]
    return pts if refresh else [p for p in pts if not F.smap_path(*p).exists()]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--presets", action="store_true", help="all preset regions without a SMAP file")
    ap.add_argument("--refresh", action="store_true", help="with --presets: include regions already downloaded")
    ap.add_argument("--task", help="resume an AppEEARS task id that was already submitted")
    ap.add_argument("--start", default="2015-04-01")
    ap.add_argument("--end", default=(dt.date.today() - dt.timedelta(days=30)).isoformat())
    a = ap.parse_args()
    if a.presets:
        points = preset_points(a.refresh)
        if not points:
            print("Every preset region already has SMAP data (use --refresh to download again).")
            return
    elif a.lat is not None and a.lon is not None:
        points = [(round(a.lat, 2), round(a.lon, 2))]
    else:
        ap.error("give --lat and --lon, or --presets")
    if a.task:
        collect(a.task, {"Authorization": f"Bearer {login()}"}, points)
    else:
        run(points, dt.date.fromisoformat(a.start), dt.date.fromisoformat(a.end))


if __name__ == "__main__":
    main()
