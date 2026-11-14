"""Field Shift — NASA Earth observations for smarter crop rotation decisions.

Run:  streamlit run app.py
"""
import streamlit as st

st.set_page_config(page_title="Field Shift", page_icon="🌾", layout="wide",
                   initial_sidebar_state="expanded")

from src import ui  # noqa: E402

ui.init_state()
ui.inject_css()

pages = [
    st.Page("views/0_Home.py", title="Home", icon="🏠", default=True),
    st.Page("views/1_Farm_Profile.py", title="My Farm", icon="🧑‍🌾"),
    st.Page("views/2_NASA_Insights.py", title="NASA Insights", icon="🛰️"),
    st.Page("views/3_Seasonal_Analysis.py", title="Seasonal Analysis", icon="📅"),
    st.Page("views/4_Rotation_Comparison.py", title="Compare Rotations", icon="🔄"),
    st.Page("views/5_Recommendations.py", title="Recommendations", icon="✅"),
    st.Page("views/6_Data_and_Methods.py", title="Data & Methods", icon="📚"),
]
nav = st.navigation(pages)

with st.sidebar:
    p = st.session_state.profile
    st.markdown("### 🌾 Field Shift")
    st.caption("NASA Earth observations → crop rotation decisions")
    st.markdown(f"**📍 {p['place']}**  \n{p['lat']:.2f}°N, {p['lon']:.2f}°E")
    st.markdown(f"**Now growing:** {ui.rotation_name(p['current_rotation'])}")
    st.divider()
    st.caption("Field Shift supports — it does not replace — the advice of your local "
               "agriculture extension officer.")

nav.run()
