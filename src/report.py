"""Printable HTML report a farmer can take to an extension officer."""
from __future__ import annotations

import datetime as dt
import html
import re

from .rotation_engine import FACTORS, fmt


def _md(s: str) -> str:
    s = html.escape(s)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)


def build_report(profile: dict, evals: list, current, bundle, crops, scenario: dict) -> str:
    ranked = sorted(evals, key=lambda e: e.total, reverse=True)
    w = profile["weights"]
    tot = sum(w.values()) or 1
    rows = "".join(
        f"<tr><td>{i + 1}</td><td><b>{html.escape(e.label)}</b>{' (current)' if e is current else ''}</td>"
        f"<td>{e.total:.0f}</td>" + "".join(f"<td>{e.scores[k]:.0f}</td>" for k in FACTORS)
        + f"<td>{e.water_mm:.0f}</td><td>{e.schedule.bare_days}</td><td>{e.confidence}</td></tr>"
        for i, e in enumerate(ranked))
    blocks = ""
    for e in ranked:
        cal = "; ".join(f"{crops.loc[s.crop_id, 'name'].split(' (')[0]}: sow {fmt(s.sow)}, harvest {fmt(s.harvest)}"
                        for s in e.schedule.slots)
        li = lambda xs: "".join(f"<li>{_md(x)}</li>" for x in xs) or "<li>—</li>"  # noqa: E731
        blocks += (f"<h3>{html.escape(e.label)} — {e.total:.0f}/100 ({e.confidence} confidence)</h3>"
                   f"<p><i>{html.escape(cal)}</i></p>"
                   f"<h4>Benefits</h4><ul>{li(e.benefits)}</ul><h4>Risks</h4><ul>{li(e.risks)}</ul>"
                   f"<h4>NASA evidence</h4><ul>{li(e.evidence)}</ul>")
    gaps = sorted({g for e in evals for g in e.gaps})
    scen = ("Observed NASA record (no scenario)." if not (scenario["temp"] or scenario["rain"]) else
            f"What-if scenario: {scenario['temp']:+.1f} °C, {scenario['rain']:+d}% rainfall.")
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Field Shift report</title>
<style>body{{font-family:Segoe UI,system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1c1c1a}}
h1{{color:#2f6b2f}} table{{border-collapse:collapse;width:100%;font-size:.9rem}}
td,th{{border:1px solid #ddd;padding:.35rem .5rem;text-align:left}} th{{background:#f3f7ef}}
.note{{background:#fff8e1;border-left:4px solid #fab219;padding:.6rem 1rem}}</style></head><body>
<h1>🌾 Field Shift — crop rotation comparison</h1>
<p><b>Location:</b> {html.escape(profile['place'])} ({profile['lat']:.2f}°N, {profile['lon']:.2f}°E) ·
<b>Soil:</b> {html.escape(profile['soil_texture'])}, salinity: {html.escape(profile['salinity_class'])} ·
<b>Water:</b> {html.escape(profile['irrigation'])}, {html.escape(profile['water_availability'])} ·
<b>Farm area:</b> {profile['farm_area_acres']} acres</p>
<p><b>Priorities:</b> {' · '.join(f"{FACTORS[k]} {100 * v / tot:.0f}%" for k, v in w.items() if v)}</p>
<p><b>Climate data:</b> NASA POWER daily, {bundle.quality['first_date']} → {bundle.quality['last_date']};
scoring years {bundle.years[0]}–{bundle.years[-1]}. {html.escape(scen)}</p>
<h2>Ranking</h2>
<table><tr><th>#</th><th>Rotation</th><th>Total</th>{''.join(f'<th>{v}</th>' for v in FACTORS.values())}
<th>Net irrigation mm/yr</th><th>Bare days</th><th>Confidence</th></tr>{rows}</table>
<h2>Details</h2>{blocks}
<h2>What to check before changing</h2><ul>{''.join(f'<li>{_md(g)}</li>' for g in gaps)}</ul>
<p class="note">Field Shift compares the relative suitability of rotations under documented assumptions. It does not
predict yield or profit. NASA data describe the surrounding region (POWER ≈ 0.5°, MODIS 250 m), not an individual field.
Discuss this report with your local agriculture extension officer.</p>
<p style="color:#777;font-size:.8rem">Generated {dt.date.today():%d %b %Y} by Field Shift · NASA Space Apps Challenge.</p>
</body></html>"""
