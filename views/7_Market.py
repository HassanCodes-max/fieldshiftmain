import plotly.express as px
import streamlit as st

from src import ui

ui.init_state()
ui.inject_css()
p = st.session_state.profile

st.title("Market Intelligence")
st.caption("Wholesale crop prices reported by Punjab AMIS (Directorate of Agriculture, Economics & Marketing).")

d = ui.amis_prices()
if d is None or d.empty:
    st.info("No AMIS price data is loaded yet. Run `python -m scripts.fetch_amis` (internet needed) to download "
            "today's wholesale prices into `data/raw/amis/`. Field Shift never shows made-up prices.",
            icon=":material/info:")
    st.stop()

dates = sorted(d["date"].dt.date.unique())
latest = d[d["date"] == d["date"].max()]
st.markdown(ui.badge("observed", f"AMIS · {len(dates)} snapshot{'s' if len(dates) > 1 else ''}, latest "
                     f"{dates[-1]:%d %b %Y}") + ui.pill("Rs per 100 kg · wholesale", "info")
            + ui.pill(f"{latest['market'].nunique()} markets", "info"), unsafe_allow_html=True)
st.markdown("<div class='fs-note'><b>Wholesale ≠ farm-gate.</b> These are market-committee auction prices. "
            "What a farmer receives is usually lower after transport, commission and quality deductions. "
            "Use them to compare crops and markets, not as a profit estimate.</div>", unsafe_allow_html=True)
st.write("")

# ------------------------------------------------------------------ crop summary
CROP_LABEL = {"wheat": "🌾 Wheat", "rice": "🍚 Rice / paddy", "maize": "🌽 Maize", "mungbean": "🫘 Mungbean (moong)",
              "cotton": "☁️ Cotton (phutti)"}
k = st.columns(5)
for col, crop in zip(k, CROP_LABEL):
    x = latest[latest["crop"] == crop]
    if x.empty:
        ui.kpi(col, "—", "not reported in this snapshot", CROP_LABEL[crop], ui.badge("missing"))
        continue
    main = x[x["commodity"].isin(["Wheat", "Maize", "Moong", "Rice (IRRI)", "Seed Cotton(Phutti)", "Cotton(Phutti)"])]
    x2 = main if not main.empty else x
    ui.kpi(col, f"Rs {x2['price'].median():,.0f}",
           f"median of {len(x2)} market{'s' if len(x2) > 1 else ''} · range {x2['price'].min():,.0f}–"
           f"{x2['price'].max():,.0f}", CROP_LABEL[crop], ui.pill(x2["commodity"].iloc[0], "info"))
st.caption("Rice uses Rice (IRRI) for the headline; basmati and kainat varieties are listed below.")

# ------------------------------------------------------------------ comparison chart
st.markdown("#### Prices by market")
choice = st.multiselect("Commodities", sorted(latest["commodity"].unique()),
                        default=[c for c in ["Wheat", "Maize", "Moong", "Rice (IRRI)", "Seed Cotton(Phutti)"]
                                 if c in set(latest["commodity"])])
sel = latest[latest["commodity"].isin(choice)]
if sel.empty:
    st.info("Pick at least one commodity.")
else:
    fig = px.strip(sel, x="price", y="commodity", color="commodity", hover_data=["market"],
                   color_discrete_sequence=["#2F754B", "#B8892B", "#163D2B", "#7FA88A", "#8C6D3F", "#5B8DA0"])
    fig.update_traces(marker=dict(size=12, line=dict(width=1, color="white")))
    fig.update_layout(height=80 + 55 * len(choice), showlegend=False, margin=dict(l=10, r=10, t=10, b=10),
                      xaxis_title="Rs per 100 kg (wholesale)", yaxis_title=None, plot_bgcolor="white",
                      font=dict(family="Inter, sans-serif"))
    fig.update_xaxes(gridcolor="#E1E8E2", tickformat=",")
    st.plotly_chart(fig, width="stretch")
    st.caption("Each dot is one market. Hover to see its name.")

# ------------------------------------------------------------------ availability vs. farm profile
st.markdown("#### Market availability for your crops")
rows = []
for crop, lbl in CROP_LABEL.items():
    x = latest[latest["crop"] == crop]
    rows.append({"Crop": lbl, "Markets reporting a price": x["market"].nunique(),
                 "Markets": ", ".join(sorted(x["market"].unique())) or "—",
                 "Your answer on My Farm": p["market"].get(crop, "Unknown")})
st.dataframe(rows, width="stretch", hide_index=True)
st.caption("Field Shift's market score uses **your** answer (can you sell this crop?). AMIS shows whether a crop "
           "is traded in Punjab markets, not whether a buyer is near your village.")

# ------------------------------------------------------------------ history
st.markdown("#### Price history")
if len(dates) < 2:
    st.info("Only one snapshot so far. Each run of `python -m scripts.fetch_amis` on a new day adds one, and this "
            "chart then shows the trend.", icon=":material/timeline:")
else:
    h = d[d["commodity"].isin(choice)].groupby(["date", "commodity"], as_index=False)["price"].median()
    st.plotly_chart(px.line(h, x="date", y="price", color="commodity", markers=True), width="stretch")

with st.expander("All prices in this snapshot"):
    st.dataframe(latest.sort_values(["crop", "commodity", "market"])[
        ["commodity", "market", "date", "price", "unit"]], width="stretch", hide_index=True)
    st.download_button("Download AMIS prices (CSV)", d.to_csv(index=False), "fieldshift_amis_prices.csv",
                       icon=":material/download:")
st.caption("Source: http://www.amis.pk — WholeSale Prices of Agricultural Commodities (Rs/100Kg).")
