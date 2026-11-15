"""Download and cache NASA data for every preset region (run once before a demo).

    python -m scripts.prefetch            # all regions
    python -m scripts.prefetch faisalabad # one region
"""
import sys
import time

from src import data_fetch as F
from src.rotation_engine import load_regions


def main(only=None):
    regions = load_regions()
    for _, r in regions.iterrows():
        if only and r["region_id"] not in only:
            continue
        t = time.time()
        print(f"\n== {r['name']} ({r['lat']}, {r['lon']})")
        try:
            if "--refresh" in sys.argv:
                F.landcover_path(r["lat"], r["lon"]).unlink(missing_ok=True)
            lc = F.load_landcover(r["lat"], r["lon"], fetch=True)
            print(f"   MODIS land cover {lc['year']}: {lc['class_name']} (class {lc['centre_class']}), "
                  f"cropland fraction {lc['cropland_fraction']:.0%}"
                  + ("" if lc["is_cropland"] else "  <-- WARNING: preset point is not cropland"))
        except Exception as e:  # noqa: BLE001
            print("   land cover check failed:", e)
        df, meta = F.load_power(r["lat"], r["lon"], refresh="--refresh" in sys.argv)
        print(f"   POWER: {len(df)} days {df['date'].min():%Y-%m-%d} → {df['date'].max():%Y-%m-%d}")
        nd = F.load_ndvi(r["lat"], r["lon"], refresh="--refresh" in sys.argv)
        print(f"   MODIS NDVI: {len(nd)} composites, mean good-pixel fraction "
              f"{nd['good_pixel_fraction'].mean():.0%}")
        print(f"   done in {time.time() - t:.0f}s")


if __name__ == "__main__":
    main([a for a in sys.argv[1:] if not a.startswith("--")] or None)
