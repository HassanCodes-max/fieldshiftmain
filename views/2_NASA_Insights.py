import pandas as pd
import streamlit as st

from src import climate_analysis as CA
from src import config as C
from src import ndvi_forecast as N
from src import soil_analysis as S
from src import ui
from src import vegetation_analysis as V
from src import visualization as VIZ

ui.init_state()
ui.inject_css()
st.title("🛰️ NASA Insights")
ui.farm_banner()
b, status = ui.current_bundle()
if b is None:
    ui.no_data_stop()

yrs = f"{b.years[0]}–{b.years[-1]}"
st.caption(f"Climate normals use the {len(b.years)} most recent complete years ({yrs}). "
           f"Data cover {b.quality['first_date']} → {b.quality['last_date']}.")

# ------------------------------------------------------------------ KPIs
k = st.columns(5)
ann = b.annual[b.annual["year"].isin(b.years)]
ui.kpi(k[0], f"{b.clim['tmax'].max():.1f} °C", f"hottest month avg max ({b.clim.loc[b.clim['tmax'].idxmax(), 'month_name']})")
ui.kpi(k[1], f"{ann['hot_days'].mean():.0f}", f"days per year ≥ {C.HOT_DAY_C:.0f} °C")
ui.kpi(k[2], f"{ann['rain'].mean():.0f} mm", "average yearly rainfall")
ui.kpi(k[3], f"{ann['et0'].mean():.0f} mm", "yearly evaporative demand (ET₀)")
if b.ndvi_clim is not None:
    ui.kpi(k[4], f"{b.ndvi_clim['ndvi'].max():.2f}", "peak seasonal NDVI (greenness)")
else:
    ui.kpi(k[4], "—", "NDVI not loaded")

st.markdown("#### What the data says")
for line in CA.headline_insights(b.clim, ann, b.trends):
    st.markdown("- " + line)

tabs = st.tabs(["🌡️ Temperature", "🌧️ Rain & water demand", "💧 Soil moisture", "🌿 Vegetation (NDVI)",
                "📈 Long-term change", "⬇️ Download data", "🗺️ Trend map"])

with tabs[6]:
    import plotly.express as px
    dy = ui.district_years()
    METRICS = {"hot_days": ("Very hot days (max ≥ 40 °C)", "days", "YlOrRd"),
               "wheat_heat_days": ("March–April days ≥ 32 °C (wheat grain filling)", "days", "YlOrRd"),
               "rain": ("Yearly rainfall", "mm", "Blues"), "monsoon_rain": ("Monsoon (Jul–Sep) rainfall", "mm", "Blues"),
               "ndvi_peak": ("Peak greenness (MODIS NDVI)", "NDVI", "Greens"),
               "smap_mean": ("Mean surface soil moisture (SMAP)", "m³/m³", "BrBG")}
    have = [k for k in METRICS if k in dy.columns and dy[k].notna().any()]
    mk = st.selectbox("Indicator", have, format_func=lambda k: METRICS[k][0])
    d = dy.dropna(subset=[mk]).sort_values("year")
    name, unit, scale = METRICS[mk]
    st.markdown(f"**{name} across the 6 districts, year by year.** Press ▶ to play the years, or drag the slider.")
    fig = px.scatter_map(d, lat="lat", lon="lon", color=mk, size=[18] * len(d), size_max=26, hover_name="district",
                         hover_data={mk: ":.2f" if unit in ("NDVI", "m³/m³") else ":.0f", "lat": False, "lon": False},
                         animation_frame="year", color_continuous_scale=scale,
                         range_color=(d[mk].quantile(.05), d[mk].quantile(.95)), zoom=6.2,
                         center={"lat": 31.2, "lon": 73.0}, map_style="carto-positron", height=520,
                         labels={mk: unit, "year": "Year"})
    fig.update_layout(margin=dict(l=0, r=0, t=0, b=0), font=dict(family="Inter, sans-serif"))
    st.plotly_chart(fig, width="stretch")
    first, last = int(d["year"].min()), int(d["year"].max())
    k = 5
    early = d[d["year"] < first + k].groupby("district")[mk].mean()
    late = d[d["year"] > last - k].groupby("district")[mk].mean()
    tbl = pd.DataFrame({f"{first}–{first + k - 1}": early, f"{last - k + 1}–{last}": late})
    tbl["Change"] = tbl.iloc[:, 1] - tbl.iloc[:, 0]
    st.markdown(f"**Change between the first and last {k} years** ({unit})")
    st.dataframe(tbl.style.format("{:+.2f}" if unit in ("NDVI", "m³/m³") else "{:+.0f}", subset=["Change"])
                 .format("{:.2f}" if unit in ("NDVI", "m³/m³") else "{:.0f}", subset=tbl.columns[:2]), width="stretch")
    st.caption("Each dot is one district's sampling point (POWER ≈ 50 km cell, MODIS 2 × 2 km, SMAP 9 km). "
               "Single years vary a lot; read the direction of change, not one year's value.")

with tabs[0]:
    st.markdown("**Average daily maximum and minimum temperature by month** · NASA POWER `T2M_MAX`, `T2M_MIN`")
    st.plotly_chart(VIZ.fig_temperature(b.clim), width="stretch")
    st.caption("Hover for values. The shaded band spans the average daily range. The dotted line marks "
               f"{C.HOT_DAY_C:.0f} °C, above which most crops suffer heat stress at flowering.")

with tabs[1]:
    st.markdown("**Monthly rainfall vs. how much water the air pulls from crops and soil** · "
                "`PRECTOTCORR` and Hargreaves ET₀ (FAO-56)")
    st.plotly_chart(VIZ.fig_rain_vs_demand(b.clim), width="stretch")
    st.caption("When the orange line is above the blue bar, rainfall cannot meet crop demand and irrigation fills the gap. "
               "Whiskers show the 10–90% range across years — rainfall in Punjab varies a lot from year to year.")

with tabs[2]:
    series, label = S.soil_moisture_series(b.daily, b.smap)
    st.markdown(f"**Monthly soil wetness** · {label}")
    st.plotly_chart(VIZ.fig_soil(b.clim, "relative wetness (0–1)"), width="stretch")
    if b.smap is not None:
        import plotly.graph_objects as go
        sm = b.smap.copy()
        sm["month"] = sm["date"].dt.month
        mc = sm.groupby("month")["soil_moisture"].mean().reindex(range(1, 13))
        fig = go.Figure(go.Scatter(x=C.MONTHS, y=mc.values, mode="lines+markers", name="SMAP",
                                   line=dict(color=VIZ.SERIES[2], width=2), marker=dict(size=8),
                                   hovertemplate="%{x}: %{y:.3f} m³/m³<extra></extra>"))
        st.markdown(f"**NASA SMAP satellite surface soil moisture** ({sm['date'].min():%Y}–{sm['date'].max():%Y})")
        st.plotly_chart(VIZ._base(fig, None, yaxis_title="m³/m³", legend=False), width="stretch")
        rec = f" {sm['recommended'].mean():.0%} of days carry SMAP's *recommended quality* flag" \
            if "recommended" in sm else ""
        st.caption(f"{len(sm):,} days with a valid retrieval (AM/PM overpasses averaged, 9 km pixel, top ~5 cm).{rec}"
                   + (" — over this mixed irrigated/urban pixel SMAP flags its retrievals as uncertain, so read the "
                      "seasonal pattern, not exact values." if "recommended" in sm and sm["recommended"].mean() < 0.5
                      else "."))
    if b.smap is None:
        st.info("This is model-based soil wetness from NASA POWER (MERRA-2). It does not include irrigation "
                "applied by farmers, so irrigated fields are wetter than shown. NASA SMAP satellite soil "
                "moisture can be added with a free Earthdata login — see **Data & Methods**.")
    st.markdown("**Root-zone wetness anomaly** (difference from the monthly average) — blue = wetter, red = drier")
    st.plotly_chart(VIZ.fig_anomaly_heatmap(b.monthly, "soil_root", b.all_years, "Δ wetness", reverse=True),
                    width="stretch")

with tabs[3]:
    if b.ndvi is None:
        st.info("MODIS NDVI is not loaded for this location yet — use the download button at the top of this page.")
    else:
        st.markdown("**Typical yearly vegetation cycle** · MODIS MOD13Q1 NDVI, 250 m, 16-day, "
                    f"{b.ndvi['year'].min()}–{b.ndvi['year'].max()} (median of pixels in a ~2 × 2 km window)")
        st.plotly_chart(VIZ.fig_ndvi_season(b.ndvi_clim, b.ndvi_windows, b.ndvi_threshold), width="stretch")
        st.markdown(f"**Relatively bare periods detected:** {V.describe_windows(b.ndvi_windows)}")
        st.caption("Two green peaks usually mark the rabi (wheat, Feb–Mar) and kharif (Aug–Oct) crops. "
                   "Low NDVI is not automatically bad: it also marks harvest, land preparation and fallow.")
        st.markdown("**Full NDVI record** — drag the slider below the chart to zoom")
        st.plotly_chart(VIZ.fig_ndvi_timeseries(b.ndvi), width="stretch")
        st.caption(f"Average share of high-quality pixels: {b.ndvi['good_pixel_fraction'].mean():.0%} "
                   "(MODIS pixel reliability 0–1). Cloudy monsoon composites are noisier.")

        st.markdown("#### 🔮 6-week greenness outlook " + ui.badge("forecast", "ML forecast"), unsafe_allow_html=True)
        model = ui.ndvi_model()
        if model is None:
            st.info("The outlook needs MODIS NDVI for at least two preset regions.")
        else:
            import plotly.graph_objects as go
            o = N.outlook(model, st.session_state.profile["region_id"], b.ndvi)
            st.markdown(N.describe(o))
            hist = b.ndvi.tail(12)
            clim = b.ndvi_clim.set_index("slot")["ndvi"]
            t = o.table
            fig = go.Figure()
            fig.add_trace(go.Scatter(x=list(t["date"]) + list(t["date"])[::-1], y=list(t["hi"]) + list(t["lo"])[::-1],
                                     fill="toself", fillcolor="rgba(184,137,43,.18)", line=dict(width=0),
                                     name="likely range (80%)", hoverinfo="skip"))
            fig.add_trace(go.Scatter(x=hist["date"], y=hist["slot"].map(clim), name="normal for the date",
                                     line=dict(color="#758078", dash="dot")))
            fig.add_trace(go.Scatter(x=hist["date"], y=hist["ndvi"], name="MODIS observed", mode="lines+markers",
                                     line=dict(color="#2F754B", width=3)))
            fig.add_trace(go.Scatter(x=[hist["date"].iloc[-1]] + list(t["date"]),
                                     y=[hist["ndvi"].iloc[-1]] + list(t["ndvi"]), name="outlook",
                                     mode="lines+markers", line=dict(color="#B8892B", width=3, dash="dash")))
            st.plotly_chart(VIZ._base(fig, None, yaxis_title="NDVI"), width="stretch")
            sk = model.skill.rename(columns={
                "days": "Days ahead", "mae_model": "Model error", "mae_normal": "'Normal year' error",
                "mae_persist": "'Anomaly persists' error", "skill_vs_normal": "Better than normal year",
                "skill_vs_persist": "Better than persistence", "n": "Test cases"}).drop(columns="lead")
            st.markdown("**How good is it?** Tested on years the model never saw (leave-one-year-out, 6 districts). "
                        "Error = mean absolute NDVI error.")
            st.dataframe(sk.style.format({c: "{:.3f}" for c in sk.columns[1:4]} |
                                         {c: "{:+.0%}" for c in sk.columns[4:6]}), hide_index=True, width="stretch")
            st.caption("Honest reading: the model clearly beats 'today's anomaly persists' and slightly beats the "
                       "seasonal norm at 16 days; by 48 days it is no better than the norm. It describes greenness of "
                       "a ~2 × 2 km area and is not a yield forecast.")

with tabs[4]:
    a, c = st.columns(2, gap="large")
    with a:
        st.markdown(f"**Very hot days per year (max ≥ {C.HOT_DAY_C:.0f} °C)**")
        st.plotly_chart(VIZ.fig_annual(b.annual, "hot_days", "days"), width="stretch")
    with c:
        st.markdown("**March–April days ≥ 32 °C (wheat grain filling)**")
        st.plotly_chart(VIZ.fig_annual(b.annual, "wheat_heat_days", "days", VIZ.SERIES[3]), width="stretch")
    a, c = st.columns(2, gap="large")
    with a:
        st.markdown("**Yearly rainfall**")
        st.plotly_chart(VIZ.fig_annual(b.annual, "rain", "mm", VIZ.SERIES[0]), width="stretch")
    with c:
        st.markdown("**Monsoon (Jul–Sep) rainfall**")
        st.plotly_chart(VIZ.fig_annual(b.annual, "monsoon_rain", "mm", VIZ.SERIES[0]), width="stretch")
    st.markdown("**Monthly maximum-temperature anomaly** — red = hotter than normal for that month")
    st.plotly_chart(VIZ.fig_anomaly_heatmap(b.monthly, "tmax", b.all_years, "Δ °C"), width="stretch")
    st.caption("Trend lines are simple linear fits over the record shown; with ~25 years they describe "
               "the direction of change, not a statistically tested projection.")

with tabs[5]:
    st.markdown("All data shown here can be downloaded for your own analysis.")
    d = b.daily.drop(columns=["was_missing"])
    st.download_button("Daily NASA POWER + derived ET₀ (CSV)", d.to_csv(index=False), "fieldshift_daily.csv")
    st.download_button("Monthly indicators (CSV)", b.monthly.to_csv(index=False), "fieldshift_monthly.csv")
    if b.ndvi is not None:
        st.download_button("MODIS NDVI time series (CSV)", b.ndvi.to_csv(index=False), "fieldshift_ndvi.csv")
    st.json({"POWER metadata": b.meta, "data quality": b.quality}, expanded=False)
