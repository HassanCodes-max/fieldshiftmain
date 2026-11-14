import streamlit as st

from src import ui

ui.init_state()
ui.inject_css()

st.markdown("""
<div class="fs-hero">
  <span class="tag">🛰️ NASA Earth data</span><span class="tag">🧠 Explainable decision engine</span>
  <span class="tag">🌱 Sustainable farming</span>
  <h1>Field Shift</h1>
  <p>Turning NASA satellite and climate observations into clear, honest crop-rotation choices
  for farmers in Punjab — which rotation saves water, protects the soil and copes with heat,
  and what the risks are.</p>
</div>
""", unsafe_allow_html=True)

st.markdown("#### How it works — five steps")
cols = st.columns(5)
steps = [
    ("🧑‍🌾", "1 · Tell us about your farm", "Location, soil, water, current crops and what matters most to you."),
    ("🛰️", "2 · NASA looks at your land", "25 years of daily weather (POWER), vegetation from MODIS satellites, soil wetness."),
    ("📅", "3 · Find the stress seasons", "When is it too hot, too dry, too wet — and when is the field bare?"),
    ("🔄", "4 · Compare rotations", "Your current rotation vs. alternatives, simulated on the real weather of each year."),
    ("✅", "5 · Get a clear answer", "Ranked options with benefits, risks, evidence and what to check locally."),
]
for c, (i, t, b) in zip(cols, steps):
    ui.card(c, i, t, b)

st.write("")
c1, c2 = st.columns([3, 2], gap="large")
with c1:
    st.markdown("#### The questions Field Shift answers")
    st.markdown("""
1. **What has the climate been like on my land** — and is it changing?
2. **Which seasons bring heat, water or soil-moisture stress?**
3. **When is my field bare** (low vegetation) between crops?
4. **How does my current rotation compare** with alternatives?
5. **Which rotation suits my priorities best — and what are its risks?**
""")
    st.markdown("<div class='fs-note'>Field Shift compares the <b>relative suitability</b> of rotations under stated, "
                "documented assumptions. It does <b>not</b> promise yields, profits or exact water savings, and "
                "NASA data at 0.5°–250 m resolution describes your <b>region</b>, not a single field.</div>",
                unsafe_allow_html=True)
with c2:
    st.markdown("#### Start here")
    if st.button("🧑‍🌾  Set up my farm", type="primary", width="stretch"):
        st.switch_page("views/1_Farm_Profile.py")
    if st.button("🛰️  See NASA insights for the demo farm", width="stretch"):
        st.switch_page("views/2_NASA_Insights.py")
    if st.button("✅  Jump to recommendations", width="stretch"):
        st.switch_page("views/5_Recommendations.py")
    st.caption("A demo farm near Faisalabad is pre-filled so you can explore immediately.")

st.divider()
st.markdown("#### NASA data inside Field Shift")
d1, d2, d3, d4 = st.columns(4)
ui.card(d1, "🌡️", "NASA POWER", "Daily temperature, rainfall, humidity, solar radiation and soil wetness since 2001. "
        "<br><span class='fs-pill fs-good'>live</span>")
ui.card(d2, "🌿", "MODIS MOD13Q1", "250 m NDVI vegetation greenness every 16 days since 2015 — shows growing and bare periods. "
        "<br><span class='fs-pill fs-good'>live</span>")
ui.card(d3, "💧", "SMAP soil moisture", "9 km satellite surface soil moisture. Until connected, POWER's MERRA-2 soil wetness is used. "
        "<br><span class='fs-pill fs-warn'>needs Earthdata login</span>")
ui.card(d4, "🌧️", "GPM IMERG", "0.1° satellite rainfall to cross-check POWER precipitation. "
        "<br><span class='fs-pill fs-warn'>needs Earthdata login</span>")
