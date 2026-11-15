"""Soil-health profile of a rotation: pest-cycle break, erosion risk, forage value, and the role of
nitrogen-fixing, cover and deep-rooting crops.

Uses data/crop_knowledge/crop_traits.csv (FAO-56 root depths plus Punjab extension guidance) and the
NASA SRTM slope of the location. This is explanatory: it does not change the rotation scores.
"""
from __future__ import annotations

import pandas as pd

from . import config as C

LEVELS = ["Low", "Moderate", "High"]


def load_traits() -> pd.DataFrame:
    return pd.read_csv(C.KNOWLEDGE / "crop_traits.csv").set_index("crop_id")


def _depth(t) -> float:
    return float(str(t["max_root_depth_m"]).split("-")[-1])


def profile(crop_ids: list[str], bare_days: int, texture: str, burns_residue: bool,
            slope_pct: float | None, traits: pd.DataFrame, names: dict) -> dict:
    tr = traits.loc[[c for c in crop_ids if c in traits.index]]
    nm = lambda cs: ", ".join(names.get(c, c) for c in cs)  # noqa: E731
    fams = list(dict.fromkeys(tr["botanical_family"]))
    grasses = [c for c in crop_ids if c in traits.index and traits.at[c, "botanical_family"].startswith("Poaceae")]

    # ---- pest-cycle break
    pest_txt = []
    if len(fams) == 1 and fams[0].startswith("Poaceae"):
        pest = 0
        pest_txt.append("Only grasses in the rotation, so cereal pests, diseases and grassy weeds carry over "
                        "from one crop to the next.")
        if {"rice", "wheat"} <= set(crop_ids):
            pest_txt.append("Rice → wheat is known to build up the weed Phalaris minor (dumbi sitti) in wheat.")
        if "maize" in crop_ids and "rice" not in crop_ids:
            pest = 1
            pest_txt.append("Replacing flooded rice with maize removes the flooded conditions rice pests and "
                            "puddling depend on, but it is still a grass.")
    else:
        pest = 2
        others = [c for c in crop_ids if c not in grasses]
        pest_txt.append(f"{nm(others)} is not a grass, so it breaks the cycle of cereal pests, diseases and "
                        "grassy weeds.")
    if {"cotton", "mungbean"} <= set(crop_ids):
        pest = min(pest, 1)
        pest_txt.append("Cotton and mungbean both host whitefly (leaf-curl and yellow-mosaic viruses): plan "
                        "spraying and resistant varieties with your extension officer.")

    # ---- erosion risk (water from slope; wind/rain splash from bare soil)
    ero_txt = []
    if slope_pct is None:
        ero = 1 if bare_days >= 90 else 0
        ero_txt.append("Slope unknown (SRTM elevation not loaded).")
    else:
        ero = 0 if slope_pct < 1 else 1 if slope_pct < 3 else 2
        ero_txt.append(f"NASA SRTM slope around the farm is about {slope_pct:.1f}% "
                       f"({'flat plain, low water-erosion risk' if slope_pct < 1 else 'gentle slope' if slope_pct < 3 else 'sloping land, runoff can carry soil away'}).")
    if bare_days >= 90:
        ero = max(ero, 1)
        ero_txt.append(f"The field is bare for about {bare_days} days a year, exposing soil to hot dry wind "
                       "and the first monsoon storms.")
        if texture in ("sand", "loamy sand", "sandy loam"):
            ero = 2
            ero_txt.append("Light sandy soil left bare blows away easily (wind erosion).")
    elif bare_days <= 40:
        ero_txt.append(f"Only about {bare_days} bare days a year: the soil stays covered most of the time.")
    if burns_residue:
        ero_txt.append("Burning crop residue leaves the surface unprotected and removes organic matter.")

    # ---- forage
    fv = {c: traits.at[c, "forage_value"] for c in crop_ids if c in traits.index}
    high = [c for c, v in fv.items() if v == "high"]
    forage = 2 if len(high) >= 2 else 1 if high or "medium" in fv.values() else 0
    forage_txt = [f"{names.get(c, c)}: {traits.at[c, 'forage_use']}" for c in fv]

    # ---- roles
    nfix = [c for c in crop_ids if c in traits.index and traits.at[c, "nitrogen_fixing"] == "yes"]
    deep = [c for c in crop_ids if c in traits.index and "deep-rooting" in traits.at[c, "soil_role"]]
    cover = [c for c in crop_ids if c in traits.index and "cover crop" in traits.at[c, "soil_role"]]
    roles = []
    if nfix:
        roles.append(f"🫘 **Nitrogen fixing:** {nm(nfix)} adds nitrogen from the air through root bacteria, so the "
                     "next crop needs less urea.")
    if cover:
        roles.append(f"🌿 **Cover crop:** {nm(cover)} covers the soil in the hot April–June fallow, protecting it "
                     "from sun, wind and the first heavy rains.")
    if deep:
        depth = max(_depth(traits.loc[c]) for c in deep)
        roles.append(f"🌱 **Deep-rooting:** {nm(deep)} roots reach about {depth:.1f} m, using subsoil water and "
                     "loosening compacted layers such as the plough pan left by puddled rice.")
    if "rice" in crop_ids:
        roles.append("⚠️ **Puddled rice** breaks soil structure and forms a plough pan; burning its straw removes "
                     "organic matter.")
    if not roles:
        roles.append("No nitrogen-fixing, cover or deep-rooting crop in this rotation.")

    return {"pest": LEVELS[pest], "pest_txt": pest_txt, "erosion": LEVELS[ero], "erosion_txt": ero_txt,
            "forage": LEVELS[forage], "forage_txt": forage_txt, "roles": roles,
            "n_fixing": bool(nfix), "deep": bool(deep), "cover": bool(cover), "families": len(fams)}
