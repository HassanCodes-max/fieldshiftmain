"""Download every Earthdata-login dataset for all preset regions in one go.

    python -m scripts.fetch_earthdata

1. GPM IMERG monthly rainfall (GES DISC OPeNDAP) for every preset region - a few minutes;
2. NASA SMAP soil moisture (AppEEARS) for every preset region that has none yet - one request, 5–30 minutes.

Options: --skip-smap (rainfall only), --refresh (download again), --forget (change the saved login).

You are asked for your Earthdata username/password once; after NASA accepts them they are saved in
Windows Credential Manager (or set EARTHDATA_USERNAME / EARTHDATA_PASSWORD, or add
`machine urs.earthdata.nasa.gov login <user> password <pass>` to ~/.netrc or ~/_netrc).
Before the first run, approve "NASA GESDISC DATA ARCHIVE" under Applications → Authorized Apps in your
Earthdata profile. Nothing is written to disk except the data files in data/raw/.
"""
from __future__ import annotations

import datetime as dt
import sys

import requests

from src import data_fetch as F
from src.rotation_engine import load_regions

from . import earthdata_auth as EA
from . import fetch_imerg as FI
from . import fetch_smap as FS


class _Tee:
    """Copy console output to a log file (prompts and passwords typed by the user are not echoed)."""

    def __init__(self, stream, path):
        self.stream, self.file = stream, open(path, "a", encoding="utf-8", buffering=1)

    def write(self, s):
        self.stream.write(s)
        self.file.write(s)
        return len(s)

    def flush(self):
        self.stream.flush()
        self.file.flush()


def main():
    if "--log" in sys.argv:
        log = sys.argv[sys.argv.index("--log") + 1]
        sys.stdout = _Tee(sys.stdout, log)
        sys.stderr = _Tee(sys.stderr, log)
    if "--forget" in sys.argv:
        EA.forget()
    src = EA.source()
    if src == "keyring":
        print("Using the Earthdata login saved in Windows Credential Manager (run with --forget to change it).")
    EA.credentials()  # ask once, up front
    print("Checking the Earthdata login with NASA AppEEARS ...")
    r = requests.post(f"{FS.API}/login", auth=EA.credentials(), timeout=60)
    if r.status_code in (401, 403):
        if src == "keyring":
            EA.forget()
        sys.exit("ERROR: NASA rejected this Earthdata username/password - nothing was downloaded. "
                 "Check them at https://urs.earthdata.nasa.gov and run again.")
    r.raise_for_status()
    if src == "prompt" and EA.remember(*EA.credentials()):
        print("Login OK - saved in Windows Credential Manager, so you will not be asked again.")
    print("Login OK - starting downloads.")
    regions = [(r["name"], round(float(r["lat"]), 2), round(float(r["lon"]), 2)) for _, r in load_regions().iterrows()]
    refresh = "--refresh" in sys.argv

    print("== GPM IMERG monthly rainfall")
    session = FI.make_session()
    for name, lat, lon in regions:
        print(name)
        try:
            FI.fetch_point(session, lat, lon, FI.C.IMERG_START_YEAR, refresh)
        except FI.AuthError as e:
            print(f"IMERG ERROR: {e}")
            print("Skipping the rest of IMERG; continuing with SMAP.")
            break
        except Exception as e:  # noqa: BLE001 - a network problem must not block SMAP
            print(f"IMERG ERROR for {name}: {type(e).__name__}: {str(e)[:300]}")
            print("Skipping the rest of IMERG; continuing with SMAP. Re-run later; regions already saved are not downloaded again.")
            break

    print("\n== NASA SMAP soil moisture")
    points = [] if "--skip-smap" in sys.argv else FS.preset_points(refresh)
    if points:
        FS.run(points, dt.date(2015, 4, 1), dt.date.today() - dt.timedelta(days=30))
    else:
        print("skipped (--skip-smap)" if "--skip-smap" in sys.argv else "every preset region already has SMAP data")

    print("\n== Summary")
    for name, lat, lon in regions:
        print(f"  {name:22s} IMERG {'ok' if F.imerg_path(lat, lon).exists() else 'MISSING':8s} "
              f"SMAP {'ok' if F.smap_path(lat, lon).exists() else 'MISSING'}")


if __name__ == "__main__":
    main()
