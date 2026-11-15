import streamlit as st

from src import rotation_engine as R
from src import ui
from src.report import build_report

ui.init_state()
ui.inject_css()
crops = ui.crops_df()
p = st.session_state.profile

st.title("✅ Recommendations")
ui.farm_banner()
b, _ = ui.current_bundle()
if b is None:
    ui.no_data_stop()

evals, cur = ui.evaluations(st.session_state.compare or ["rwm", "mw"])
colors = ui.rotation_colors()
ranked = sorted(evals, key=lambda e: e.total, reverse=True)
best = ranked[0]

# ------------------------------------------------------------------ headline
if best is cur:
    st.success(f"### 👍 Your current rotation, **{cur.label}**, scores best for your priorities.\n"
               "The alternatives below may still be worth testing on part of your land — see their benefits and risks.")
else:
    gain = best.total - cur.total
    st.success(f"### 🌱 **{best.label}** is the best match for your priorities\n"
               f"It scores **{best.total:.0f}/100** vs. **{cur.total:.0f}/100** for your current "
               f"{cur.label} (+{gain:.0f} points).")

# robustness: does the winner change if one priority dominates?
alt_winners = {}
for k, lbl in [("water", "water saving"), ("soil", "soil health"), ("climate", "climate resilience")]:
    win = max(evals, key=lambda e: e.scores[k])
    alt_winners[lbl] = win.label
robust = sum(v == best.label for v in alt_winners.values())
st.markdown(
    "**How robust is this?** If you cared only about… " +
    " · ".join(f"{lbl}: *{w}*" for lbl, w in alt_winners.items()) +
    (f" — **{best.label}** wins {robust} of 3." if robust else ""), unsafe_allow_html=False)

st.divider()

# ------------------------------------------------------------------ cards
for i, e in enumerate(ranked):
    conf_kind = {"High": "good", "Medium": "warn", "Low": "bad"}[e.confidence]
    tag = " · your current rotation" if e is cur else ""
    medal = ["🥇", "🥈", "🥉"][i] if i < 3 else "▫️"
    st.markdown(
        f"<div class='fs-rank' style='--c:{colors.get(e.label, '#999')}'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem'>"
        f"<div><span style='font-size:1.3rem'>{medal}</span> <b style='font-size:1.25rem'>{e.label}</b>"
        f"<span style='color:#5f5e59'>{tag}</span><br>"
        + "".join(ui.pill(f"{R.FACTORS[k]} {e.scores[k]:.0f}", "info") for k in R.FACTORS) +
        f"</div><div style='text-align:right'><div class='score'>{e.total:.0f}<span style='font-size:1rem;color:#5f5e59'>/100</span></div>"
        f"{ui.pill(e.confidence + ' confidence', conf_kind)}</div></div></div>", unsafe_allow_html=True)
    if e.gates:
        st.warning("⛔ **Not recommended as-is:** " + "; ".join(e.gates) +
                   ". Its score was reduced by 30% so this deal-breaker cannot be averaged away.")
    c1, c2 = st.columns(2, gap="large")
    with c1:
        st.markdown("**✅ Possible benefits**")
        for x in e.benefits or ["No clear advantage over the current rotation on the factors measured."]:
            st.markdown(f"- {x}")
    with c2:
        st.markdown("**⚠️ Risks to manage**")
        for x in e.risks[:6] or ["No major risks flagged by the data used."]:
            st.markdown(f"- {x}")
        if len(e.risks) > 6:
            with st.popover(f"+{len(e.risks) - 6} more risks"):
                for x in e.risks[6:]:
                    st.markdown(f"- {x}")
    with st.expander("🛰️ NASA evidence behind this result"):
        for x in e.evidence:
            st.markdown(f"- {x}")
        if e.bare_cover_pct is not None:
            st.markdown(f"- MODIS NDVI low-vegetation window covered by a crop: **{e.bare_cover_pct:.0f}%**.")
        st.caption(f"Simulated on observed weather of cycle-years {e.baseline_years[0]}–{e.baseline_years[-1]}."
                   if e.baseline_years else "")
    sp = ui.soil_profile(e)
    lvl = {"Low": "bad", "Moderate": "warn", "High": "good"}
    ero = {"Low": "good", "Moderate": "warn", "High": "bad"}
    with st.expander("🌱 Soil health, pests, erosion & forage"):
        st.markdown(ui.pill(f"Pest-cycle break: {sp['pest']}", lvl[sp['pest']])
                    + ui.pill(f"Erosion risk: {sp['erosion']}", ero[sp['erosion']])
                    + ui.pill(f"Forage value: {sp['forage']}", lvl[sp['forage']]), unsafe_allow_html=True)
        for x in sp["roles"]:
            st.markdown("- " + x)
        a1, a2, a3 = st.columns(3, gap="medium")
        a1.markdown("**🐛 Pests & weeds**\n\n" + "\n".join(f"- {x}" for x in sp["pest_txt"]))
        a2.markdown("**🌬️ Erosion**\n\n" + "\n".join(f"- {x}" for x in sp["erosion_txt"]))
        a3.markdown("**🐄 Forage**\n\n" + "\n".join(f"- {x}" for x in sp["forage_txt"]))
        st.caption("From crop traits (FAO-56 root depths, Punjab extension guidance) and NASA SRTM slope. "
                   "Pest pressure differs by village and year — confirm with your extension officer.")
    st.write("")

# ------------------------------------------------------------------ gaps + next steps
st.divider()
a, c = st.columns(2, gap="large")
with a:
    st.markdown("#### 🔍 Information gaps")
    for g in sorted({g for e in evals for g in e.gaps}):
        st.markdown(f"- {g}")
with c:
    st.markdown("#### 👨‍🌾 Before you change — checklist for your extension officer")
    items = [
        f"Is {best.label} recommended for my district and the varieties available?",
        "Which sowing dates work for my village (canal schedule, labour, machinery)?",
        "Get a soil test (texture, pH, ECe, organic matter, N-P-K) if not done in the last 3 years.",
        "Are there buyers / procurement for every crop in the new rotation?",
        "Try the new rotation on a small part of the farm first and compare.",
    ]
    for i, it in enumerate(items):
        st.checkbox(it, key=f"chk_{i}")

st.divider()
html = build_report(p, evals, cur, b, crops, st.session_state.scenario)
c1, c2 = st.columns([1, 2])
c1.download_button("📄 Download my report (HTML)", html, file_name="field_shift_report.html",
                   mime="text/html", type="primary", width="stretch")
c2.caption("Open the file in any browser and print it or share it on WhatsApp with your extension officer.")
st.markdown("<div class='fs-note'>These results compare <b>relative suitability</b> under the assumptions on "
            "<b>Data & Methods</b>. They are not yield, profit or exact water-saving predictions.</div>",
            unsafe_allow_html=True)
