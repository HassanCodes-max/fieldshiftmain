import json

import folium
import streamlit as st
from streamlit_folium import st_folium

from src import rotation_engine as R
from src import soil_analysis as S
from src import ui

ui.init_state()
ui.inject_css()
p = st.session_state.profile
crops = ui.crops_df()
regions = R.load_regions()

st.title("🧑‍🌾 My Farm")
st.caption("Tell Field Shift about your land. Nothing personal is needed — only farming information. "
           "Your answers stay in this browser session.")

# ------------------------------------------------------------------ 1. location
st.subheader("1 · Where is your farm?")
c1, c2 = st.columns([2, 3], gap="large")
with c1:
    options = list(regions["region_id"]) + ["custom"]
    labels = {r["region_id"]: f"{r['name']} — {r['zone']}" for _, r in regions.iterrows()}
    labels["custom"] = "📍 My own location (click the map)"
    idx = options.index(p["region_id"]) if p["region_id"] in options else len(options) - 1
    choice = st.radio("Choose a region", options, index=idx, format_func=labels.get)
    if choice != "custom":
        r = regions.set_index("region_id").loc[choice]
        if choice != p["region_id"]:
            p.update(region_id=choice, place=r["name"], lat=float(r["lat"]), lon=float(r["lon"]))
        p["zone"] = r["zone"]
        st.caption(f"Typical rotation here: **{r['typical_rotation']}**. {r['note']}.")
    else:
        if p["region_id"] != "custom":
            p.update(region_id="custom", place="My location")
        zones = ["Don't know", "Rice-wheat zone", "Mixed cropping zone", "Cotton-wheat zone"]
        z = st.selectbox("Agro-ecological zone", zones,
                         index=zones.index(p.get("zone") or "Don't know"),
                         help="Rice-wheat: Gujranwala, Sheikhupura, Sialkot, Hafizabad… · Mixed: Faisalabad, Okara, "
                              "Sahiwal, Jhang… · Cotton-wheat: Multan, Bahawalpur, Rahim Yar Khan, Vehari…")
        p["zone"] = None if z == "Don't know" else z
        cc1, cc2 = st.columns(2)
        lat = cc1.number_input("Latitude", 23.5, 37.0, float(p["lat"]), 0.01, format="%.2f")
        lon = cc2.number_input("Longitude", 60.0, 78.0, float(p["lon"]), 0.01, format="%.2f")
        p.update(lat=round(lat, 2), lon=round(lon, 2), place=f"My location ({lat:.2f}, {lon:.2f})")
        st.caption("Click anywhere on the map to set your location. New locations download NASA data "
                   "the first time (≈ 10 s for weather, 1–3 min for satellite vegetation).")
with c2:
    m = folium.Map(location=[p["lat"], p["lon"]], zoom_start=7, tiles=None, control_scale=True)
    folium.TileLayer("Esri.WorldImagery", name="Satellite", attr="Esri World Imagery").add_to(m)
    folium.TileLayer("OpenStreetMap", name="Map").add_to(m)
    for _, r in regions.iterrows():
        folium.CircleMarker([r["lat"], r["lon"]], radius=6, color="#ffffff", weight=2, fill=True,
                            fill_color="#2f6b2f", fill_opacity=1, tooltip=f"{r['name']} · {r['zone']}").add_to(m)
    folium.Marker([p["lat"], p["lon"]], tooltip="Selected location",
                  icon=folium.Icon(color="orange", icon="leaf")).add_to(m)
    folium.Circle([p["lat"], p["lon"]], radius=1000, color="#fab219", weight=2, fill=False,
                  tooltip="≈ MODIS NDVI sampling window (2 × 2 km)").add_to(m)
    folium.LayerControl(collapsed=True).add_to(m)
    out = st_folium(m, height=380, use_container_width=True, returned_objects=["last_clicked"], key="farm_map")
    click = out.get("last_clicked") if out else None
    if click and click != st.session_state.get("_last_map_click"):
        st.session_state["_last_map_click"] = click  # handle each click once
        lat, lon = round(click["lat"], 2), round(click["lng"], 2)
        p.update(region_id="custom", lat=lat, lon=lon, place=f"My location ({lat:.2f}, {lon:.2f})", zone=None)
        st.rerun()

# ------------------------------------------------------------------ 2. soil & water
st.subheader("2 · Your soil and water")
a, b, c = st.columns(3, gap="large")
with a:
    p["soil_texture"] = st.selectbox(
        "Soil type", S.TEXTURES, index=S.TEXTURES.index(p["soil_texture"]),
        help="If unsure: sandy soil feels gritty and drains fast; clay is sticky when wet and cracks when dry; "
             "loam is in between.")
    p["salinity_class"] = st.selectbox("Soil salinity (from a soil test)", list(S.SALINITY_CLASSES),
                                       index=list(S.SALINITY_CLASSES).index(p["salinity_class"]),
                                       help="ECe = electrical conductivity of the soil saturation extract.")
    p["ece"] = S.SALINITY_CLASSES[p["salinity_class"]]
with b:
    irr = ["Canal", "Tubewell", "Canal + tubewell", "Rainfed"]
    p["irrigation"] = st.selectbox("Irrigation source", irr, index=irr.index(p["irrigation"]))
    lv = ["Reliable", "Moderate", "Limited"]
    p["water_availability"] = st.select_slider("How reliable is your water?", lv, value=p["water_availability"])
    st.caption({"Reliable": "Water whenever the crop needs it.",
                "Moderate": "Usually enough, sometimes short in May–June.",
                "Limited": "Often short; tubewell costs or canal turns limit irrigation."}[p["water_availability"]])
with c:
    p["waterlogging"] = st.toggle("Water stands in my field for days after heavy rain", value=p["waterlogging"])
    p["burns_residue"] = st.toggle("Rice straw / crop residue is usually burnt", value=p["burns_residue"])
    p["farm_area_acres"] = st.number_input("Farm area (acres)", 0.5, 5000.0, float(p["farm_area_acres"]), 0.5)

# ------------------------------------------------------------------ 3. crops & market
st.subheader("3 · What do you grow, and where can you sell?")
a, b = st.columns([2, 3], gap="large")
with a:
    rots = ui.all_rotations()
    rid = st.selectbox("Your current rotation", list(rots), index=list(rots).index(p["current_rotation"]),
                       format_func=ui.rotation_name)
    p["current_rotation"] = rid
with b:
    st.markdown("Can you sell each crop at a fair price nearby?")
    cols = st.columns(len(crops))
    for col, (cid, cr) in zip(cols, crops.iterrows()):
        p["market"][cid] = col.radio(f"{cr['emoji']} {cr['name'].split(' (')[0]}", ["Yes", "Unknown", "No"],
                                     index=["Yes", "Unknown", "No"].index(p["market"].get(cid, "Unknown")),
                                     key=f"mk_{cid}")

# ------------------------------------------------------------------ 4. priorities
st.subheader("4 · What matters most to you?")
st.caption("Move the sliders. Field Shift turns them into weights for the comparison (they do not need to add up).")
w = p["weights"]
a, b, c = st.columns(3, gap="large")
w["water"] = a.slider("💧 Save water", 0, 10, w["water"])
w["soil"] = b.slider("🌱 Improve soil health", 0, 10, w["soil"])
w["climate"] = c.slider("🌡️ Cope with heat & weather risk", 0, 10, w["climate"])
with st.expander("More factors (soil fit, calendar, market)"):
    a, b, c = st.columns(3)
    w["soilfit"] = a.slider("🧪 Suits my soil & salinity", 0, 10, w["soilfit"])
    w["calendar"] = b.slider("📅 Fits the sowing calendar", 0, 10, w["calendar"])
    w["market"] = c.slider("🏪 I can sell the crops", 0, 10, w["market"])
tot = sum(w.values()) or 1
st.markdown(" ".join(ui.pill(f"{R.FACTORS[k]} {100 * v / tot:.0f}%", "info") for k, v in w.items() if v),
            unsafe_allow_html=True)

st.divider()
a, b, c = st.columns([2, 2, 3])
if a.button("🛰️ Show NASA insights for my farm", type="primary", width="stretch"):
    st.switch_page("views/2_NASA_Insights.py")
if b.button("✅ Go to recommendations", width="stretch"):
    st.switch_page("views/5_Recommendations.py")
with c:
    st.download_button("💾 Save my farm profile", json.dumps(p, indent=2, default=str),
                       file_name="field_shift_profile.json", mime="application/json", width="stretch")
up = st.file_uploader("Load a saved farm profile", type="json", label_visibility="collapsed")
if up is not None and not st.session_state.get("_loaded_" + up.name):
    st.session_state.profile.update(json.load(up))
    st.session_state["_loaded_" + up.name] = True
    st.rerun()
