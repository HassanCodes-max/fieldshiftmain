import folium
import streamlit as st
from streamlit_folium import st_folium

from src import config as C
from src import ndvi_forecast as N
from src import ui

ui.init_state()
ui.inject_css()
p = st.session_state.profile

st.markdown("""
<div class="fs-hero">
  <span class="tag">🛰️ NASA Earth observations</span><span class="tag">🧮 Explainable FAO-based engine</span>
  <span class="tag">🌱 Punjab, Pakistan</span>
  <h1>Make Smarter Decisions for Your Land.</h1>
  <p>Field Shift combines 25 years of NASA climate, vegetation and soil-moisture data with local crop knowledge
  to compare crop rotations for water use, soil health, climate risk and market access, and explains every result.</p>
</div>
""", unsafe_allow_html=True)

b, _ = ui.current_bundle()

# ------------------------------------------------------------------ farm summary + map
c1, c2 = st.columns([2, 3], gap="large")
with c1:
    st.markdown("#### Your farm")
    salt = p["salinity_class"] if p.get("ece") is None else f"ECe {p['ece']} dS/m"
    st.markdown(
        f"<div class='fs-card'>"
        f"<h4>📍 {p['place']}</h4><p>{p['lat']:.2f}°N, {p['lon']:.2f}°E · {p.get('zone') or 'zone not set'}</p><br>"
        f"<p><b>Soil</b> {p['soil_texture']} · {salt}{' · waterlogged' if p['waterlogging'] else ''}</p>"
        f"<p><b>Water</b> {p['irrigation']} · {p['water_availability']}</p>"
        f"<p><b>Now growing</b> {ui.rotation_name(p['current_rotation'])}</p>"
        f"<p><b>Area</b> {p['farm_area_acres']:g} acres</p><br>"
        + ui.badge("farmer", "Farmer-entered (edit on My Farm)") + "</div>", unsafe_allow_html=True)
    st.write("")
    if st.button("Edit my farm", icon=":material/edit:", width="stretch"):
        st.switch_page("views/1_Farm_Profile.py")
with c2:
    m = folium.Map(location=[p["lat"], p["lon"]], zoom_start=10, tiles=None, control_scale=True)
    folium.TileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                     attr="Esri World Imagery", name="Satellite").add_to(m)
    folium.Marker([p["lat"], p["lon"]], tooltip=p["place"], icon=folium.Icon(color="green", icon="leaf")).add_to(m)
    folium.Rectangle([[p["lat"] - 0.009, p["lon"] - 0.0105], [p["lat"] + 0.009, p["lon"] + 0.0105]],
                     color="#B8892B", weight=2, fill=False, tooltip="MODIS NDVI window (~2 × 2 km)").add_to(m)
    st_folium(m, height=330, width="100%", returned_objects=[], key="overview_map")
    st.caption("Gold box = the ~2 × 2 km area MODIS greenness is taken from. NASA POWER weather covers a ~50 km cell.")

if b is None:
    ui.no_data_stop()

# ------------------------------------------------------------------ indicators
st.markdown("#### Environmental indicators")
k = st.columns(5)
if b.ndvi is not None:
    last = b.ndvi.iloc[-1]
    norm = b.ndvi_clim.set_index("slot")["ndvi"].get(last["slot"])
    diff = last["ndvi"] - norm
    word = "above" if diff > 0.03 else "below" if diff < -0.03 else "near"
    ui.kpi(k[0], f"{last['ndvi']:.2f}", f"{word} normal ({norm:.2f}) · {last['date']:%d %b %Y}",
           "Vegetation (NDVI)", ui.badge("observed", "MODIS · observed"))
else:
    ui.kpi(k[0], "—", "MODIS NDVI not loaded", "Vegetation (NDVI)", ui.badge("missing"))
if b.smap is not None and not b.smap.empty:
    sm = b.smap.sort_values("date")
    ls = sm.iloc[-1]
    mon = sm[sm["date"].dt.month == ls["date"].month]["soil_moisture"].mean()
    word = "wetter" if ls["soil_moisture"] > mon * 1.1 else "drier" if ls["soil_moisture"] < mon * 0.9 else "near"
    ui.kpi(k[1], f"{ls['soil_moisture']:.2f} m³/m³", f"{word} than usual for the month ({mon:.2f}) · {ls['date']:%d %b %Y}",
           "Surface soil moisture", ui.badge("observed", "SMAP · observed"))
else:
    ui.kpi(k[1], f"{b.clim['soil_top'].mean():.2f}" if "soil_top" in b.clim else "—",
           "POWER model soil wetness (0–1), yearly mean", "Soil moisture", ui.badge("modelled"))
ui.kpi(k[2], f"{b.clim['tmax'].max():.1f} °C",
       f"hottest month average max ({b.clim.loc[b.clim['tmax'].idxmax(), 'month_name']})",
       "Heat", ui.badge("modelled", "POWER · reanalysis"))
ann = b.annual[b.annual["year"].isin(b.years)]
ui.kpi(k[3], f"{ann['rain'].mean():.0f} mm", f"rain per year vs. {ann['et0'].mean():.0f} mm evaporative demand",
       "Rainfall", ui.badge("modelled", "POWER · reanalysis"))
ui.kpi(k[4], f"{b.quality['last_date']}", f"latest NASA POWER day · {len(b.all_years)} complete years",
       "Data up to", ui.badge("observed", "cached archive"))
st.caption("These values come from a cached NASA archive and are not live sensor readings. NASA POWER is a "
           "satellite-and-model reanalysis at ~50 km; MODIS and SMAP are satellite observations.")

# ------------------------------------------------------------------ seasonal risk + outlook + next action
st.write("")
a, c = st.columns([3, 2], gap="large")
with a:
    st.markdown("#### Seasonal risk overview")
    inds = [x for x in b.stress.columns if x != "month"]
    chips = []
    for _, r in b.stress.iterrows():
        lv = [r[i][0] for i in inds if isinstance(r[i], tuple)]
        hi = [i for i in inds if isinstance(r[i], tuple) and r[i][0] == 2]
        top = max(lv) if lv else 0
        kind = ["good", "warn", "bad"][top]
        chips.append(ui.pill(f"{C.MONTHS[int(r['month']) - 1]}{': ' + ', '.join(hi) if hi else ''}", kind))
    st.markdown(" ".join(chips), unsafe_allow_html=True)
    st.caption("Green = low · gold = moderate · red = high risk, from the NASA POWER and MODIS climatology. "
               "See **Seasonal Analysis** for the reasons behind each month.")
    model = ui.ndvi_model()
    if model is not None and b.ndvi is not None:
        o = N.outlook(model, p["region_id"], b.ndvi)
        sk = model.skill.set_index("lead")
        st.markdown("#### 6-week greenness outlook " + ui.badge("forecast", "ML forecast"), unsafe_allow_html=True)
        st.markdown(f"<div class='fs-insight'>{N.describe(o).replace('**', '')}<br>"
                    f"<span class='fs-source'>Ridge-regression model trained on MODIS NDVI 2015–2026 for 6 districts. "
                    f"Tested on held-out years: {sk.loc[1, 'skill_vs_persist']:.0%} more accurate than "
                    f"'today's anomaly persists' at 16 days; close to the seasonal norm after 48 days.</span></div>",
                    unsafe_allow_html=True)
with c:
    st.markdown("#### Recommended next action")
    evals, cur = ui.evaluations(st.session_state.compare or ["rwm", "mw"])
    best = max(evals, key=lambda e: e.total)
    if best is cur:
        msg = (f"Your current rotation <b>{cur.label}</b> scores best ({cur.total:.0f}/100) for your priorities. "
               "Review its risks before the next season.")
    else:
        msg = (f"Consider <b>{best.label}</b>: it scores <b>{best.total:.0f}/100</b> vs. {cur.total:.0f} for your "
               f"current {cur.label}. Discuss a trial on part of your land with your extension officer.")
    st.markdown(f"<div class='fs-card'><h4>✅ {best.label}</h4><p>{msg}</p><br>"
                f"{ui.pill(best.confidence + ' confidence', {'High': 'good', 'Medium': 'warn', 'Low': 'bad'}[best.confidence])}"
                "</div>", unsafe_allow_html=True)
    st.write("")
    if st.button("See full recommendations", icon=":material/task_alt:", type="primary", width="stretch"):
        st.switch_page("views/5_Recommendations.py")
    if st.button("Compare rotations", icon=":material/autorenew:", width="stretch"):
        st.switch_page("views/4_Rotation_Comparison.py")
    st.caption("Scores are relative suitability under documented assumptions, not a probability of success.")

# ------------------------------------------------------------------ data sources
st.divider()
st.markdown("#### Data inside Field Shift")
smap_ok = b.smap is not None
amis = ui.amis_prices()
src = [
    ("🌡️", "NASA POWER", "Daily weather and model soil wetness since 2001, ~50 km.", "observed", "In use"),
    ("🌿", "MODIS MOD13Q1 NDVI", "Vegetation greenness, 250 m, every 16 days since 2015.", "observed", "In use"),
    ("🗺️", "MODIS MCD12Q1", "Land cover. Confirms each preset point is cropland.", "observed", "In use"),
    ("💧", "SMAP SPL3SMP_E", "Satellite surface soil moisture, 9 km, 2015–2026.",
     "observed" if smap_ok else "missing", "In use" if smap_ok else "Not loaded here"),
    ("🏪", "Punjab AMIS", "Wholesale crop prices from Punjab markets.",
     "observed" if amis is not None else "missing",
     f"Snapshot {amis['date'].max():%d %b %Y}" if amis is not None else "Not loaded"),
    ("⛰️", "NASA SRTM", "Elevation and slope (90 m) for erosion risk.", "observed", "In use"),
    ("🌧️", "GPM IMERG", "Satellite rainfall cross-check. Used in the public website build.", "planned", "Planned here"),
    ("🌊", "GRACE / GRACE-FO", "Groundwater storage trend.", "planned", "Next step"),
    ("🌡️", "ECOSTRESS", "Land-surface temperature and plant water stress, 70 m.", "planned", "Next step"),
]
for row in range(0, len(src), 4):
    cols = st.columns(4)
    for col, (i, t, d, kind, txt) in zip(cols, src[row:row + 4]):
        ui.card(col, i, t, d + "<br><br>" + ui.badge(kind, txt))
    st.write("")
