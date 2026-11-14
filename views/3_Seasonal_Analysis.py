import streamlit as st

from src import config as C
from src import preprocessing as P
from src import ui
from src import visualization as VIZ

ui.init_state()
ui.inject_css()
st.title("📅 Seasonal Analysis")
ui.farm_banner()
b, _ = ui.current_bundle()
if b is None:
    ui.no_data_stop()

st.markdown("#### Stress calendar — when is farming hardest here?")
st.caption(f"Each cell combines NASA observations for that month ({b.years[0]}–{b.years[-1]} average). "
           "Hover any cell to see the numbers behind it. ▲ moderate · ▲▲ high.")
st.plotly_chart(VIZ.fig_stress_matrix(b.stress), width="stretch")
st.markdown(
    ui.pill("low", "good") + ui.pill("▲ moderate", "warn") + ui.pill("▲▲ high", "bad"), unsafe_allow_html=True)

# months where several indicators are stressed together
inds = [c for c in b.stress.columns if c != "month"]
multi = []
for _, r in b.stress.iterrows():
    hi = [i for i in inds if r[i][0] == 2]
    if len(hi) >= 2:
        multi.append((C.MONTHS[int(r["month"]) - 1], hi))
if multi:
    st.markdown("#### ⚠️ Months where several stresses overlap")
    for mth, hi in multi:
        st.markdown(f"- **{mth}**: {', '.join(hi)}")

st.markdown("#### Your current rotation on top of the vegetation cycle")
evals, cur = ui.evaluations([])
st.plotly_chart(VIZ.fig_calendar([cur], ui.crops_df(), b.ndvi_windows), width="stretch")
if b.ndvi_windows:
    if cur.bare_cover_pct is not None:
        st.markdown(f"MODIS sees relatively bare land in the shaded period(s). Your current rotation has a crop "
                    f"in the field for **{cur.bare_cover_pct:.0f}%** of that time and leaves "
                    f"**~{cur.schedule.bare_days} days** a year without a crop.")
st.caption("The calendar uses regional sowing windows; your own dates may differ by a few weeks.")

st.markdown("#### Season by season")
seas = P.to_seasonal(b.monthly)
seas = seas[seas["season_year"].isin(b.years)]
tbl = seas.groupby("season").agg(
    **{"Avg max °C": ("tmax", "mean"), "Avg min °C": ("tmin", "mean"), "Rain mm": ("rain", "mean"),
       "ET₀ mm": ("et0", "mean"), "Root-zone wetness": ("soil_root", "mean"),
       f"Days ≥ {C.HOT_DAY_C:.0f} °C": ("hot_days", "mean"), "Heavy-rain days": ("heavy_rain_days", "mean")}
).reindex(list(P.SEASONS))
tbl["Water balance mm"] = tbl["Rain mm"] - tbl["ET₀ mm"]
st.dataframe(tbl.style.format("{:.1f}").format("{:.2f}", subset=["Root-zone wetness"]),
             width="stretch")
st.caption("Water balance = rainfall − evaporative demand. Negative values are the gap irrigation must fill.")

if b.ndvi_peaks is not None and not b.ndvi_peaks.empty:
    st.markdown("#### Did hot springs coincide with weaker wheat greenness?")
    import plotly.graph_objects as go
    j = b.ndvi_peaks.merge(b.annual[["year", "wheat_heat_days"]], on="year").dropna()
    fig = go.Figure(go.Scatter(x=j["wheat_heat_days"], y=j["rabi_peak"], mode="markers+text", text=j["year"],
                               textposition="top center", marker=dict(size=11, color=VIZ.SERIES[3],
                                                                      line=dict(color="white", width=2)),
                               hovertemplate="%{text}: %{x} hot days, peak NDVI %{y:.2f}<extra></extra>"))
    fig.update_xaxes(title="days ≥ 32 °C in March–April (NASA POWER)")
    VIZ._base(fig, None, height=360, yaxis_title="peak rabi NDVI (MODIS)", legend=False)
    st.plotly_chart(fig, width="stretch")
    st.caption("Each dot is one year. This is an exploratory comparison of two NASA datasets — "
               "peak greenness also depends on sowing date, variety, irrigation and inputs, so a pattern here is "
               "a reason to investigate, not proof of cause.")
