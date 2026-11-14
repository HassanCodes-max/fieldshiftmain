import pandas as pd
import streamlit as st

from src import config as C
from src import rotation_engine as R
from src import ui
from src import visualization as VIZ

ui.init_state()
ui.inject_css()
crops = ui.crops_df()
p = st.session_state.profile

st.title("🔄 Compare Rotations")
ui.farm_banner()
b, _ = ui.current_bundle()
if b is None:
    ui.no_data_stop()

# ------------------------------------------------------------------ controls
c1, c2 = st.columns([3, 2], gap="large")
with c1:
    rots = ui.all_rotations()
    alts = [r for r in rots if r != p["current_rotation"]]
    chosen = st.multiselect(
        f"Compare your current rotation (**{ui.rotation_name(p['current_rotation'])}**) with…",
        alts, default=[r for r in st.session_state.compare if r in alts][:3], format_func=ui.rotation_name,
        max_selections=4)
    st.session_state.compare = chosen
    with st.expander("➕ Build your own rotation"):
        names = {cid: f"{r['emoji']} {r['name'].split(' (')[0]}" for cid, r in crops.iterrows()}
        cc = st.columns(3)
        first = cc[0].selectbox("First crop", list(names), format_func=names.get, key="b1")
        second = cc[1].selectbox("Then", list(names), index=1, format_func=names.get, key="b2")
        third = cc[2].selectbox("Then (optional)", ["—"] + list(names),
                                format_func=lambda x: "— none —" if x == "—" else names[x], key="b3")
        seq = [first, second] + ([third] if third != "—" else [])
        if st.button("Add this rotation to the comparison"):
            rid = "custom_" + "_".join(seq)
            st.session_state.custom_rotations[rid] = seq
            if rid not in st.session_state.compare:
                st.session_state.compare = (st.session_state.compare + [rid])[-4:]
            st.rerun()
        st.caption("Field Shift checks whether the sequence fits into one year using regional sowing windows.")
with c2:
    st.markdown("**🌡️ What-if climate scenario**")
    sc = st.session_state.scenario
    t = st.slider("Warmer by (°C)", 0.0, 3.0, float(sc["temp"]), 0.5,
                  help="Adds this amount to every day's temperature in the NASA record.")
    r = st.slider("Rainfall change (%)", -30, 30, int(sc["rain"]), 5)
    if (t, r) != (sc["temp"], sc["rain"]):
        st.session_state.scenario = {"temp": t, "rain": r}
        st.rerun()
    st.caption("0 / 0 = the observed NASA record. Scenarios are simple sensitivity tests, not climate projections.")

evals, cur = ui.evaluations(chosen)
colors = ui.rotation_colors()

# ------------------------------------------------------------------ overview
st.markdown("#### Overall suitability for your priorities")
w = p["weights"]
tot = sum(w.values()) or 1
st.caption("Weighted by your priorities: " + " · ".join(f"{R.FACTORS[k]} {100 * v / tot:.0f}%" for k, v in w.items() if v)
           + ". Change them on **My Farm**.")
st.plotly_chart(VIZ.fig_total(evals, colors), width="stretch")

st.markdown("#### Crop calendar")
st.plotly_chart(VIZ.fig_calendar(evals, crops, b.ndvi_windows), width="stretch")
infeasible = [e.label for e in evals if not e.schedule.feasible]
if infeasible:
    st.error("⛔ " + ", ".join(infeasible) + " — does not fit into one year with regional sowing windows.")

a, c = st.columns(2, gap="large")
with a:
    st.markdown("#### Score by factor")
    st.plotly_chart(VIZ.fig_scores(evals, colors), width="stretch")
with c:
    st.markdown("#### Estimated irrigation need")
    st.plotly_chart(VIZ.fig_water(evals, crops), width="stretch")
    st.caption(f"Net irrigation = crop water use (FAO-56 Kc × ET₀) minus usable rain, from a daily soil-water "
               f"balance on each year's NASA weather. 1 irrigation ≈ {C.IRRIGATION_DEPTH_MM:.0f} mm (3 inches). "
               "Canal/field losses are not included.")

st.markdown("#### Year-to-year water need")
st.plotly_chart(VIZ.fig_water_years(evals, colors), width="stretch")
st.caption("Each point is one rotation cycle simulated with that year's observed weather — dry years need more water.")

# ------------------------------------------------------------------ table
st.markdown("#### Why each score? (full breakdown)")
rows = []
for e in evals:
    row = {"Rotation": e.label + (" (current)" if e is cur else ""), "Total": round(e.total)}
    for k, lbl in R.FACTORS.items():
        row[lbl] = round(e.scores[k])
    row["Net irrigation mm/yr"] = round(e.water_mm) if pd.notna(e.water_mm) else None
    row["Bare days"] = e.schedule.bare_days
    row["Confidence"] = e.confidence
    rows.append(row)
st.dataframe(pd.DataFrame(rows).set_index("Rotation"), width="stretch")

for e in evals:
    with st.expander(f"{e.label} — how the scores were calculated"):
        for k, lbl in R.FACTORS.items():
            st.markdown(f"**{lbl} — {e.scores[k]:.0f}/100:** {e.factor_notes.get(k, '')}")
        st.markdown("**Sowing & harvest:** " + "; ".join(
            f"{crops.loc[s.crop_id, 'name'].split(' (')[0]} {R.fmt(s.sow)} → {R.fmt(s.harvest)}"
            for s in e.schedule.slots))
        pc = e.per_crop.copy()
        if not pc.empty:
            pc["crop"] = pc["crop_id"].map(lambda c: crops.loc[c, "name"].split(" (")[0])
            show = pc[["crop", "etc_mm", "rain_mm", "irrigation_mm", "irrigation_min", "irrigation_max",
                       "heat_days", "heavy_rain_days"]].rename(columns={
                "etc_mm": "Crop water use mm", "rain_mm": "Rain in season mm", "irrigation_mm": "Net irrigation mm",
                "irrigation_min": "min", "irrigation_max": "max", "heat_days": "Heat days (sensitive stage)",
                "heavy_rain_days": "Heavy-rain days (sensitive stage)"}).set_index("crop")
            st.dataframe(show.round(1), width="stretch")
        st.caption(f"Simulated cycle-years: {', '.join(map(str, e.baseline_years))}")

st.divider()
if st.button("✅ See my recommendation", type="primary"):
    st.switch_page("views/5_Recommendations.py")
