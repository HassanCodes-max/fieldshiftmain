"""Field Shift — NASA Earth observations for smarter crop rotation decisions.

Run:  streamlit run app.py
"""
import streamlit as st

st.set_page_config(page_title="Field Shift · Crop rotation decisions from NASA data", page_icon="🌾",
                   layout="wide", initial_sidebar_state="expanded")

from src import rotation_engine as R  # noqa: E402
from src import ui  # noqa: E402

ui.init_state()
ui.inject_css()

P = {
    "home": st.Page("views/0_Home.py", title="Overview", icon=":material/dashboard:", default=True),
    "farm": st.Page("views/1_Farm_Profile.py", title="My Farm", icon=":material/agriculture:"),
    "nasa": st.Page("views/2_NASA_Insights.py", title="NASA Insights", icon=":material/satellite_alt:"),
    "season": st.Page("views/3_Seasonal_Analysis.py", title="Seasonal Analysis", icon=":material/calendar_month:"),
    "rot": st.Page("views/4_Rotation_Comparison.py", title="Crop Rotation", icon=":material/autorenew:"),
    "rec": st.Page("views/5_Recommendations.py", title="Recommendations", icon=":material/task_alt:"),
    "market": st.Page("views/7_Market.py", title="Market Intelligence", icon=":material/storefront:"),
    "methods": st.Page("views/6_Data_and_Methods.py", title="Data & Methods", icon=":material/menu_book:"),
}
nav = st.navigation({
    "Start": [P["home"], P["farm"]],
    "Analyse": [P["nasa"], P["season"]],
    "Decide": [P["rot"], P["rec"], P["market"]],
    "About": [P["methods"]],
})
STEP_OF = {"My Farm": 1, "NASA Insights": 2, "Seasonal Analysis": 2, "Crop Rotation": 3, "Recommendations": 4}

with st.sidebar:
    p = st.session_state.profile
    st.markdown("<div style='font-size:1.25rem;font-weight:800;color:#163D2B'>🌾 Field Shift</div>"
                "<div class='fs-source'>NASA Earth observations → crop-rotation decisions</div>",
                unsafe_allow_html=True)
    st.write("")
    regions = R.load_regions()
    opts = list(regions["region_id"]) + (["custom"] if p["region_id"] == "custom" else [])
    names = dict(zip(regions["region_id"], regions["name"])) | {"custom": p["place"]}
    pick = st.selectbox("📍 Farm location", opts, index=opts.index(p["region_id"]), format_func=names.get,
                        help="Preset districts have all NASA data cached. Pick any point on the map in My Farm.")
    if pick != p["region_id"]:
        r = regions.set_index("region_id").loc[pick]
        p.update(region_id=pick, place=r["name"], lat=float(r["lat"]), lon=float(r["lon"]), zone=r["zone"])
        st.rerun()
    st.caption(f"{p['lat']:.2f}°N, {p['lon']:.2f}°E · now growing **{ui.rotation_name(p['current_rotation'])}**")
    st.markdown("**Your progress**")
    ui.step_tracker(STEP_OF.get(nav.title))
    st.divider()
    st.caption("Decision support only. Field Shift does not replace your local agriculture extension officer.")

nav.run()
