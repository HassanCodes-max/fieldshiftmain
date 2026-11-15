"""Fetch NASA GPM IMERG Final monthly rainfall (GPM_3IMERGM V07) for a point via GES DISC OPeNDAP.

Requires a free NASA Earthdata login (https://urs.earthdata.nasa.gov) with the
"NASA GESDISC DATA ARCHIVE" application approved in your Earthdata profile.

    python -m scripts.fetch_imerg --lat 31.30 --lon 73.25
    python -m scripts.fetch_imerg --presets            # every preset region
    python -m scripts.fetch_imerg --presets --refresh  # re-download everything

Only one 0.1° grid cell per month is requested (~300 small requests for 2001 → today), so it
takes a few minutes. Credentials come from EARTHDATA_TOKEN, or EARTHDATA_USERNAME /
EARTHDATA_PASSWORD, or ~/.netrc (_netrc on Windows), or are asked interactively; they are never written to disk.
Output: data/raw/imerg_monthly_<lat>_<lon>.csv (monthly totals in mm).
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests

from src import config as C
from src import data_fetch as F
from src.rotation_engine import load_regions

from . import earthdata_auth as EA

AUTH_HOST = EA.AUTH_HOST


class AuthError(RuntimeError):
    pass


APPROVE_URL = "https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ"


NOT_APPROVED = ("Your Earthdata account has not approved the 'NASA GESDISC DATA ARCHIVE' application yet "
                "(NASA: 'Pre authorization required for this application'). While logged in to Earthdata, open "
                f"{APPROVE_URL} and click Approve/Authorize (or Profile -> Applications -> Authorized Apps -> "
                "Approve more applications -> search 'GESDISC'), then run this again.")


def diagnose_auth(r: requests.Response) -> str:
    """Turn a refused GES DISC request into an actionable message."""
    text = r.text[:5000].lower()
    if r.status_code == 401 and AUTH_HOST in r.url:
        return "Earthdata rejected the username/password."
    if "approve" in text or "authoriz" in text or "access_denied" in r.url or "eula" in text:
        return NOT_APPROVED
    return (f"GES DISC refused the request (HTTP {r.status_code} at {r.url.split('?')[0]}). Check that the "
            f"'NASA GESDISC DATA ARCHIVE' application is approved: {APPROVE_URL}")


def make_session() -> requests.Session:
    return EA.session(F.HEADERS)


def _get(session: requests.Session, url: str, tries: int = 4) -> requests.Response:
    for k in range(tries):
        try:
            return session.get(url, timeout=120)
        except (requests.ConnectionError, requests.Timeout):
            if k == tries - 1:
                raise
            time.sleep(3 * (k + 1))


def pick_host(timeout: int = 20) -> str:
    """First GES DISC mirror that answers (checked on public metadata, no login sent)."""
    probe = C.IMERG_FILE.format(y=2001, m=1, ver="V07B")
    for host in C.IMERG_HOSTS:
        try:
            r = requests.get(f"{host}{C.IMERG_PATH}/2001/{probe}.dds", timeout=timeout, headers=F.HEADERS)
            if r.ok and "precipitation" in r.text:
                return host
        except requests.RequestException:
            pass
        print(f"  {host} is not responding - trying the next mirror")
    raise ConnectionError("No GES DISC server is reachable right now: " + ", ".join(C.IMERG_HOSTS))


def fetch_month(session: requests.Session, year: int, month: int, lat: float, lon: float,
                host: str | None = None) -> dict | None:
    """One month of IMERG at the point, trying the newest file version first. None = not published."""
    for ver in C.IMERG_VERSIONS:
        try:
            r = _get(session, F.imerg_url(year, month, ver, lat, lon, host))
        except requests.RequestException as e:  # EDL bounces an unapproved app to a data-redirect error URL
            if "access_denied" in str(e) or "authoriz" in str(e).lower():
                raise AuthError(NOT_APPROVED) from None
            raise
        if any("access_denied" in h.headers.get("Location", "") for h in r.history):
            raise AuthError(NOT_APPROVED)
        if r.status_code == 404:
            continue
        if r.status_code in (401, 403) or AUTH_HOST in r.url or "<html" in r.text[:200].lower():
            raise AuthError(diagnose_auth(r))
        r.raise_for_status()
        rate = F.parse_opendap_ascii(r.text)
        return {"date": pd.Timestamp(year, month, 1), "year": year, "month": month,
                "rate_mm_hr": rate, "imerg_rain_mm": F.imerg_month_mm(rate, year, month), "version": ver}
    return None


def fetch_point(session, lat: float, lon: float, start_year: int, refresh: bool = False) -> pd.DataFrame:
    path = F.imerg_path(lat, lon)
    old = pd.read_csv(path, parse_dates=["date"]) if path.exists() and not refresh else pd.DataFrame()
    have = set(zip(old["year"], old["month"])) if not old.empty else set()
    today = dt.date.today()
    months = [(y, m) for y in range(start_year, today.year + 1) for m in range(1, 13)
              if (y, m) < (today.year, today.month) and (y, m) not in have]
    print(f"  {len(months)} month(s) to request for {lat:.2f}, {lon:.2f} "
          f"(grid cell {F.imerg_index(lat, lon)})")
    rows = []
    host = pick_host() if months else None
    if months and host != C.IMERG_HOSTS[0]:
        print(f"  using mirror {host}")
    # check credentials on one request before starting the pool
    if months:
        first = fetch_month(session, *months[0], lat, lon, host)
        rows.append(first)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for k, res in enumerate(ex.map(lambda ym: fetch_month(session, *ym, lat, lon, host), months[1:]), 2):
            rows.append(res)
            if k % 24 == 0:
                print(f"    {k}/{len(months)}")
    new = pd.DataFrame([r for r in rows if r])
    df = pd.concat([old, new], ignore_index=True) if not old.empty else new
    if df.empty:
        return df
    df = df.drop_duplicates(["year", "month"], keep="last").sort_values("date")
    df.to_csv(path, index=False)
    valid = df["imerg_rain_mm"].notna()
    print(f"  saved {valid.sum()} months ({df.loc[valid, 'date'].min():%Y-%m} → "
          f"{df.loc[valid, 'date'].max():%Y-%m}), mean {df.loc[valid, 'imerg_rain_mm'].groupby(df['year']).sum().mean():.0f} "
          f"mm/yr → {path}")
    return df


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--presets", action="store_true", help="fetch every preset region in regions.csv")
    ap.add_argument("--start-year", type=int, default=C.IMERG_START_YEAR)
    ap.add_argument("--refresh", action="store_true", help="ignore the cached file and download again")
    a = ap.parse_args()
    if a.presets:
        points = [(float(r["lat"]), float(r["lon"])) for _, r in load_regions().iterrows()]
    elif a.lat is not None and a.lon is not None:
        points = [(a.lat, a.lon)]
    else:
        ap.error("give --lat and --lon, or --presets")
    session = make_session()
    for lat, lon in points:
        try:
            fetch_point(session, round(lat, 2), round(lon, 2), a.start_year, a.refresh)
        except AuthError as e:
            sys.exit(f"ERROR: {e}")


if __name__ == "__main__":
    main()
