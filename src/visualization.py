"""Plotly figures for Field Shift. Colours follow the entity (crop / rotation), never rank."""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from . import config as C
from .rotation_engine import FACTORS, REF_YEAR

# Validated categorical slots (light mode) - see dataviz reference palette
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
CROP_COLORS = {"rice": "#2a78d6", "wheat": "#eda100", "maize": "#eb6834",
               "mungbean": "#1baf7a", "cotton": "#e87ba4"}
STATUS = {"good": "#0ca30c", "warning": "#fab219", "serious": "#ec835a", "critical": "#d03b3b"}
TEXT, TEXT2, MUTED, GRID = "#0b0b0b", "#52514e", "#8a8984", "#e9e8e4"
BLUE_SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
DIVERGING = [[0, "#184f95"], [0.25, "#6da7ec"], [0.5, "#f0efec"], [0.75, "#ec8a83"], [1, "#b8302f"]]
MONTH_TICKS = [dt.date(REF_YEAR, m, 1) for m in range(1, 13)]


def rotation_color(index: int) -> str:
    return SERIES[index % len(SERIES)]


def _base(fig: go.Figure, title: str | None = None, height: int = 360, yaxis_title: str | None = None,
          legend: bool = True) -> go.Figure:
    fig.update_layout(
        title=dict(text=title, font=dict(size=16, color=TEXT), x=0, xanchor="left") if title else None,
        height=height, margin=dict(l=8, r=8, t=48 if title else 16, b=8),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Inter, Segoe UI, system-ui, sans-serif", size=13, color=TEXT2),
        hoverlabel=dict(bgcolor="white", font_size=13, font_color=TEXT, bordercolor=GRID),
        showlegend=legend,
        legend=dict(orientation="h", yanchor="bottom", y=1.0, xanchor="right", x=1, title=None),
    )
    fig.update_xaxes(showgrid=False, linecolor=GRID, ticks="outside", tickcolor=GRID)
    fig.update_yaxes(gridcolor=GRID, zeroline=False, linecolor=GRID, title=yaxis_title)
    return fig


# --------------------------------------------------------------------------- climate
def fig_temperature(clim: pd.DataFrame) -> go.Figure:
    x = clim["month_name"]
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=x, y=clim["tmax"], mode="lines", line=dict(width=0),
                             showlegend=False, hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=x, y=clim["tmin"], mode="lines", line=dict(width=0), fill="tonexty",
                             fillcolor="rgba(235,104,52,0.15)", name="Daily min–max range",
                             hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=x, y=clim["tmax"], mode="lines+markers", name="Avg daily max",
                             line=dict(color=SERIES[1], width=2), marker=dict(size=8),
                             hovertemplate="%{y:.1f} °C"))
    fig.add_trace(go.Scatter(x=x, y=clim["tmin"], mode="lines+markers", name="Avg daily min",
                             line=dict(color=SERIES[0], width=2), marker=dict(size=8),
                             hovertemplate="%{y:.1f} °C"))
    fig.add_hline(y=C.HOT_DAY_C, line=dict(color=MUTED, dash="dot", width=1),
                  annotation_text=f"{C.HOT_DAY_C:.0f} °C", annotation_position="top left",
                  annotation_font_color=MUTED)
    fig.update_layout(hovermode="x unified")
    return _base(fig, None, yaxis_title="°C")


def fig_rain_vs_demand(clim: pd.DataFrame) -> go.Figure:
    x = clim["month_name"]
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=x, y=clim["rain"], name="Rainfall (NASA POWER)", marker_color=SERIES[0],
        marker_line_width=0, error_y=dict(type="data", symmetric=False,
                                          array=clim["rain_p90"] - clim["rain"],
                                          arrayminus=clim["rain"] - clim["rain_p10"],
                                          color=MUTED, thickness=1, width=3),
        hovertemplate="%{y:.0f} mm (10–90% range shown)"))
    fig.add_trace(go.Scatter(x=x, y=clim["et0"], name="Evaporative demand (ET₀)", mode="lines+markers",
                             line=dict(color=SERIES[1], width=2), marker=dict(size=8),
                             hovertemplate="%{y:.0f} mm"))
    fig.update_layout(hovermode="x unified", bargap=0.35)
    return _base(fig, None, yaxis_title="mm per month")


def fig_soil(clim: pd.DataFrame, label: str) -> go.Figure:
    x = clim["month_name"]
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=x, y=clim["soil_top"], name="Surface (0–5 cm)", mode="lines+markers",
                             line=dict(color=SERIES[2], width=2), marker=dict(size=8),
                             hovertemplate="%{y:.2f}"))
    fig.add_trace(go.Scatter(x=x, y=clim["soil_root"], name="Root zone (0–100 cm)", mode="lines+markers",
                             line=dict(color=SERIES[0], width=2), marker=dict(size=8),
                             hovertemplate="%{y:.2f}"))
    fig.update_layout(hovermode="x unified")
    fig.update_yaxes(range=[0, max(0.8, float(clim[["soil_top", "soil_root"]].max().max()) + 0.05)])
    return _base(fig, None, yaxis_title=label)


def fig_annual(annual: pd.DataFrame, col: str, ylabel: str, color: str = SERIES[1]) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Bar(x=annual["year"], y=annual[col], marker_color=color, marker_line_width=0,
                         name=ylabel, hovertemplate="%{x}: %{y:.0f}<extra></extra>"))
    ok = annual[col].notna()
    if ok.sum() >= 5:
        k, b = np.polyfit(annual.loc[ok, "year"], annual.loc[ok, col], 1)
        fig.add_trace(go.Scatter(x=annual["year"], y=k * annual["year"] + b, mode="lines",
                                 line=dict(color=TEXT, width=2, dash="dash"),
                                 name=f"Linear trend ({k * 10:+.1f} per decade)", hoverinfo="skip"))
    fig.update_layout(bargap=0.25)
    return _base(fig, None, yaxis_title=ylabel, height=320)


def fig_anomaly_heatmap(monthly: pd.DataFrame, col: str, years: list[int], label: str,
                        reverse: bool = False) -> go.Figure:
    m = monthly[monthly["year"].isin(years)]
    base = m.groupby("month")[col].mean()
    m = m.assign(anom=m[col] - m["month"].map(base))
    piv = m.pivot(index="year", columns="month", values="anom").reindex(columns=range(1, 13))
    lim = float(np.nanpercentile(np.abs(piv.values), 95)) or 1
    fig = go.Figure(go.Heatmap(
        z=piv.values, x=C.MONTHS, y=piv.index.astype(str), zmid=0, zmin=-lim, zmax=lim,
        colorscale=DIVERGING if not reverse else [[1 - p, c] for p, c in DIVERGING[::-1]],
        xgap=2, ygap=2, colorbar=dict(title=label, thickness=12),
        hovertemplate="%{y} %{x}: %{z:+.1f}<extra></extra>"))
    return _base(fig, None, height=max(320, 22 * len(piv) + 80), legend=False)


# --------------------------------------------------------------------------- vegetation
def fig_ndvi_season(nclim: pd.DataFrame, windows: list[dict], threshold: float,
                    schedule=None, crops=None) -> go.Figure:
    x = nclim["date_ref"]
    fig = go.Figure()
    for w in windows:
        fig.add_vrect(x0=w["start"], x1=w["end"], fillcolor="rgba(250,178,25,0.18)", line_width=0,
                      annotation_text="low vegetation", annotation_position="top left",
                      annotation_font_color=TEXT2, annotation_font_size=11)
    fig.add_trace(go.Scatter(x=x, y=nclim["p75"], mode="lines", line=dict(width=0), showlegend=False,
                             hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=x, y=nclim["p25"], mode="lines", line=dict(width=0), fill="tonexty",
                             fillcolor="rgba(27,175,122,0.18)", name="Middle 50% of years",
                             hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=x, y=nclim["ndvi"], mode="lines+markers", name="Median NDVI",
                             line=dict(color=SERIES[2], width=2), marker=dict(size=8),
                             hovertemplate="%{x|%d %b}: NDVI %{y:.2f}<extra></extra>"))
    fig.add_hline(y=threshold, line=dict(color=MUTED, dash="dot", width=1),
                  annotation_text=f"bare-field threshold {threshold:.2f}", annotation_position="bottom right",
                  annotation_font_color=MUTED)
    fig.update_xaxes(tickformat="%b", tickvals=MONTH_TICKS, range=[dt.date(REF_YEAR, 1, 1), dt.date(REF_YEAR, 12, 31)])
    fig.update_yaxes(range=[0, 1])
    return _base(fig, None, yaxis_title="NDVI (0 = bare, 1 = dense green)")


def fig_ndvi_timeseries(nd: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=nd["date"], y=nd["ndvi"], mode="lines", name="NDVI (median of pixels)",
                             line=dict(color=SERIES[2], width=2),
                             hovertemplate="%{x|%d %b %Y}: %{y:.2f}<extra></extra>"))
    fig.update_layout(hovermode="x unified")
    fig.update_yaxes(range=[0, 1])
    fig.update_xaxes(rangeslider=dict(visible=True, thickness=0.06))
    return _base(fig, None, yaxis_title="NDVI", height=340, legend=False)


# --------------------------------------------------------------------------- seasonal
LEVEL_COLORS = {-1: "#f0efec", 0: "#d9eed9", 1: STATUS["warning"], 2: STATUS["critical"]}
LEVEL_TEXT = {-1: "no data", 0: "low", 1: "moderate", 2: "high"}


def fig_stress_matrix(stress: pd.DataFrame) -> go.Figure:
    inds = [c for c in stress.columns if c != "month"]
    z, text, hover = [], [], []
    for ind in inds:
        row_z, row_t, row_h = [], [], []
        for _, r in stress.iterrows():
            lvl, why = r[ind]
            row_z.append(lvl)
            row_t.append({2: "▲▲", 1: "▲", 0: "", -1: "·"}[lvl])
            row_h.append(f"<b>{ind} — {C.MONTHS[int(r['month']) - 1]}</b><br>Stress: {LEVEL_TEXT[lvl]}<br>{why}")
        z.append(row_z); text.append(row_t); hover.append(row_h)
    scale = [[0, LEVEL_COLORS[-1]], [0.249, LEVEL_COLORS[-1]], [0.25, LEVEL_COLORS[0]], [0.499, LEVEL_COLORS[0]],
             [0.5, LEVEL_COLORS[1]], [0.749, LEVEL_COLORS[1]], [0.75, LEVEL_COLORS[2]], [1, LEVEL_COLORS[2]]]
    fig = go.Figure(go.Heatmap(
        z=z, x=C.MONTHS, y=inds, text=text, texttemplate="%{text}", textfont=dict(color=TEXT, size=12),
        customdata=hover, hovertemplate="%{customdata}<extra></extra>",
        colorscale=scale, zmin=-1.5, zmax=2.5, xgap=3, ygap=3, showscale=False))
    fig.update_yaxes(autorange="reversed", gridcolor="rgba(0,0,0,0)")
    return _base(fig, None, height=60 + 48 * len(inds), legend=False)


def _wrap_segments(start: dt.date, end: dt.date):
    """Map an interval onto a single Jan–Dec axis (REF_YEAR), splitting at year end."""
    s = dt.date(REF_YEAR, start.month, start.day)
    length = (end - start).days
    e = s + dt.timedelta(days=length)
    if e.year == REF_YEAR:
        return [(s, e)]
    return [(s, dt.date(REF_YEAR, 12, 31)), (dt.date(REF_YEAR, 1, 1), dt.date(REF_YEAR, e.month, e.day))]


def fig_calendar(evals: list, crops: pd.DataFrame, windows: list[dict] | None = None) -> go.Figure:
    fig = go.Figure()
    seen = set()
    labels = [e.label for e in evals]
    for e in evals:
        for slot in e.schedule.slots:
            c = crops.loc[slot.crop_id]
            nm = c["name"].split(" (")[0]
            for a, b in _wrap_segments(slot.sow, slot.harvest):
                fig.add_trace(go.Bar(
                    x=[(dt.datetime.combine(b, dt.time()) - dt.datetime.combine(a, dt.time())).total_seconds() * 1000],
                    base=[dt.datetime.combine(a, dt.time())], y=[e.label], orientation="h",
                    marker=dict(color=CROP_COLORS.get(slot.crop_id, SERIES[6]), line=dict(color="white", width=2),
                                cornerradius=4),
                    name=nm, legendgroup=nm, showlegend=nm not in seen,
                    text=f"{c['emoji']} {nm}" if (b - a).days > 45 else "", textposition="inside",
                    insidetextanchor="middle", textfont=dict(color=TEXT, size=12),
                    hovertemplate=(f"<b>{nm}</b><br>Sow: {slot.sow:%d %b}<br>Harvest: {slot.harvest:%d %b}"
                                   f"<br>{(slot.harvest - slot.sow).days} days in field"
                                   + (f"<br>⚠ {slot.late_days} days late" if slot.late_days else "")
                                   + "<extra></extra>")))
                seen.add(nm)
    for w in windows or []:
        fig.add_vrect(x0=w["start"], x1=w["end"], fillcolor="rgba(250,178,25,0.15)", line_width=0,
                      annotation_text="MODIS low-NDVI period", annotation_position="top left",
                      annotation_font_size=11, annotation_font_color=TEXT2)
    fig.update_layout(barmode="overlay", bargap=0.35)
    fig.update_xaxes(type="date", tickformat="%b", tickvals=MONTH_TICKS,
                     range=[dt.datetime(REF_YEAR, 1, 1), dt.datetime(REF_YEAR, 12, 31)])
    fig.update_yaxes(categoryorder="array", categoryarray=labels[::-1], gridcolor="rgba(0,0,0,0)")
    return _base(fig, None, height=110 + 56 * len(evals))


# --------------------------------------------------------------------------- comparison
def fig_scores(evals: list, colors: dict) -> go.Figure:
    fig = go.Figure()
    cats = list(FACTORS.values())
    for e in evals:
        fig.add_trace(go.Bar(
            y=cats, x=[e.scores[k] for k in FACTORS], orientation="h", name=e.label,
            marker=dict(color=colors[e.label], cornerradius=4), marker_line_width=0,
            hovertemplate="%{y}: %{x:.0f}/100<extra>" + e.label + "</extra>"))
    fig.update_layout(barmode="group", bargap=0.3, bargroupgap=0.08)
    fig.update_xaxes(range=[0, 100], title="score (0–100, higher is better)", gridcolor=GRID, showgrid=True)
    fig.update_yaxes(autorange="reversed", gridcolor="rgba(0,0,0,0)")
    return _base(fig, None, height=int(120 + 20 * len(cats) * max(1, len(evals))))


def fig_water(evals: list, crops: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    seen = set()
    labels = [e.label for e in evals]
    for e in evals:
        for _, r in e.per_crop.iterrows():
            nm = crops.loc[r["crop_id"], "name"].split(" (")[0]
            fig.add_trace(go.Bar(
                y=[e.label], x=[r["irrigation_mm"]], orientation="h", name=nm, legendgroup=nm,
                showlegend=nm not in seen,
                marker=dict(color=CROP_COLORS.get(r["crop_id"]), line=dict(color="white", width=2)),
                hovertemplate=f"<b>{nm}</b>: %{{x:.0f}} mm net irrigation"
                              f"<br>≈ %{{customdata:.0f}} irrigations of 3 in<extra>{e.label}</extra>",
                customdata=[r["irrigation_mm"] / C.IRRIGATION_DEPTH_MM]))
            seen.add(nm)
        fig.add_annotation(y=e.label, x=e.water_mm, text=f"  {e.water_mm:.0f} mm", showarrow=False,
                           xanchor="left", font=dict(color=TEXT, size=12))
    fig.update_layout(barmode="stack", bargap=0.35)
    fig.update_xaxes(title="estimated net irrigation (mm per year)", showgrid=True, gridcolor=GRID)
    fig.update_yaxes(categoryorder="array", categoryarray=labels[::-1], gridcolor="rgba(0,0,0,0)")
    xmax = max((e.water_mm for e in evals if not np.isnan(e.water_mm)), default=1000)
    fig.update_xaxes(range=[0, xmax * 1.18])
    return _base(fig, None, height=110 + 56 * len(evals))


def fig_water_years(evals: list, colors: dict) -> go.Figure:
    fig = go.Figure()
    for e in evals:
        if e.per_year.empty:
            continue
        fig.add_trace(go.Scatter(x=e.per_year["cycle_year"], y=e.per_year["irrigation_mm"], mode="lines+markers",
                                 name=e.label, line=dict(color=colors[e.label], width=2), marker=dict(size=8),
                                 hovertemplate="%{x}: %{y:.0f} mm<extra>" + e.label + "</extra>"))
    fig.update_xaxes(title="rotation cycle starting in year", dtick=1)
    return _base(fig, None, yaxis_title="net irrigation, mm", height=320)


def fig_total(evals: list, colors: dict) -> go.Figure:
    ev = sorted(evals, key=lambda e: e.total, reverse=True)
    fig = go.Figure(go.Bar(
        y=[e.label for e in ev], x=[e.total for e in ev], orientation="h",
        marker=dict(color=[colors[e.label] for e in ev], cornerradius=4), marker_line_width=0,
        text=[f"{e.total:.0f}" for e in ev], textposition="outside", textfont=dict(color=TEXT, size=13),
        hovertemplate="%{y}: %{x:.1f}/100<extra></extra>"))
    fig.update_xaxes(range=[0, 105], showgrid=True, gridcolor=GRID, title="weighted suitability score")
    fig.update_yaxes(autorange="reversed", gridcolor="rgba(0,0,0,0)")
    return _base(fig, None, height=80 + 52 * len(ev), legend=False)
