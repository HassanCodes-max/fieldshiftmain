/* Field Shift website — all answers are computed in the browser from data precomputed by scripts/build_site.py. */
"use strict";

const PRIORITIES = {
  balanced: { water: 5, soil: 3, climate: 2, soilfit: 2, calendar: 2, market: 2 },
  water: { water: 8, soil: 3, climate: 2, soilfit: 2, calendar: 2, market: 2 },
  soil: { water: 3, soil: 8, climate: 2, soilfit: 3, calendar: 2, market: 2 },
  climate: { water: 3, soil: 2, climate: 8, soilfit: 2, calendar: 3, market: 2 },
  market: { water: 3, soil: 2, climate: 2, soilfit: 2, calendar: 2, market: 8 },
};
const CHOICES = {
  irr: ["Canal", "Tubewell", "Canal + tubewell", "Rainfed"],
  wa: ["Reliable", "Moderate", "Limited"],
  soil: ["sandy loam", "loam", "clay loam"],
  salt: ["no", "yes", "unknown"],
  wet: ["0", "1"],
  pr: Object.keys(PRIORITIES),
};
const CROP_COLORS = { rice: "#3f8fd0", wheat: "#d39a1e", maize: "#e0b400", mungbean: "#3d9b4a", cotton: "#a46fd0" };
const DEFAULTS = { lang: "en", region: "faisalabad", rot: "rw", irr: "Canal + tubewell", wa: "Moderate",
                   soil: "loam", salt: "unknown", wet: "0", pr: "balanced" };

let META = null;
const REGION = {};
const FORECAST = {};
const S = loadState();
let lastScore = 0;

/* ---------------------------------------------------------------- helpers */
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

function loadState() {
  const s = { ...DEFAULTS };
  try { Object.assign(s, JSON.parse(recall("fs_state") || "{}")); } catch (e) { /* ignore */ }
  const q = new URLSearchParams(location.search);
  const map = { l: "lang", r: "region", c: "rot", i: "irr", w: "wa", s: "soil", k: "salt", g: "wet", p: "pr" };
  for (const [short, key] of Object.entries(map)) if (q.has(short)) s[key] = q.get(short);
  return s;
}
function saveState() {
  store("fs_state", JSON.stringify(S));
  const q = new URLSearchParams({ l: S.lang, r: S.region, c: S.rot, i: S.irr, w: S.wa, s: S.soil, k: S.salt, g: S.wet, p: S.pr });
  history.replaceState(null, "", "?" + q.toString() + location.hash);
}
function validate() {
  for (const k of Object.keys(CHOICES)) if (!CHOICES[k].includes(String(S[k]))) S[k] = DEFAULTS[k];
  if (!META.regions.some(r => r.id === S.region)) S.region = DEFAULTS.region;
  if (!META.rotations[S.rot]) S.rot = DEFAULTS.rot;
  if (!I18N[S.lang]) S.lang = "en";
  S.wet = String(S.wet);
}

const T = () => I18N[S.lang];
const L = s => (S.lang === "ur" ? String(s).replace(/[0-9]/g, d => UR_DIGITS[d]) : String(s));
function t(key, vars) {
  let s = T()[key];
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  return L(s);
}
const n0 = x => Math.round(x).toString();

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const svgEl = (tag, attrs) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
};

function placeName(id) {
  return S.lang === "ur" ? DISTRICT_UR[id] : META.regions.find(r => r.id === id).en;
}
function cropName(c) { return META.crops[c][S.lang === "ur" ? "ur" : "en"]; }
function rotName(rid) {
  return META.rotations[rid].map(c => `${META.crops[c].emoji} ${cropName(c)}`).join(S.lang === "ur" ? " ← " : " → ");
}
function rotPlain(rid) { return META.rotations[rid].map(cropName).join(S.lang === "ur" ? " ← " : " → "); }
function dayLabel(d) {
  return S.lang === "ur" ? L(`${DAYS.ur[d.getDay()]} ${d.getDate()}`) : `${DAYS.en[d.getDay()]} ${d.getDate()}`;
}

/* ---------------------------------------------------------------- scoring (mirrors rotation_engine) */
function waterScore(ev) {
  const supply = S.irr === "Rainfed" ? 0 : META.supply[S.wa];
  let s = ev.s_water0;
  if (ev.water > supply) s -= supply === 0 ? 40 : Math.min(40, 40 * (ev.water - supply) / supply);
  return Math.max(0, Math.min(100, s));
}
function evaluate(region) {
  const evs = region.evals[`${S.soil}|${S.salt}|${S.wet}`];
  const w = PRIORITIES[S.pr];
  const wsum = Object.values(w).reduce((a, b) => a + b, 0);
  const ids = [S.rot, ...Object.keys(META.rotations).filter(r => r !== S.rot)];
  const out = ids.map(rid => {
    const ev = evs[rid];
    const scores = { ...ev.s, water: waterScore(ev) };
    let total = META.factors.reduce((a, k) => a + scores[k] * w[k], 0) / wsum;
    if (ev.gate) total *= 0.7;
    return { rid, ev, scores, total };
  });
  const cur = out[0];
  const ranked = [...out].sort((a, b) => b.total - a.total);
  return { ranked, cur, best: ranked[0] };
}

function reasons(best, cur) {
  const good = [], risk = [];
  const f = T();
  const cname = rotPlain(cur.rid);
  const other = best !== cur;
  if (other && cur.ev.water) {
    const pct = 100 * (best.ev.water - cur.ev.water) / cur.ev.water;
    const n = n0(Math.abs(best.ev.water - cur.ev.water) / META.irr_depth);
    if (pct <= -5) good.push(t("f_water_less", { pct: n0(-pct), current: cname, n }));
    else if (pct >= 5) risk.push(t("f_water_more", { pct: n0(pct), current: cname, n }));
  }
  if (other && best.scores.soil - cur.scores.soil >= 5) good.push(t("f_soil_better", { current: cname }));
  if (other && best.scores.climate - cur.scores.climate >= 5) good.push(t("f_climate_better", { current: cname }));
  const supply = S.irr === "Rainfed" ? 0 : META.supply[S.wa];
  if (best.ev.water > supply) {
    risk.push(supply === 0 ? t("f_rainfed", { need: n0(best.ev.water) })
                           : t("f_supply", { need: n0(best.ev.water), sup: n0(supply) }));
  }
  for (const x of best.ev.f) {
    const v = { ...x };
    if (x.crop) v.crop = cropName(x.crop);
    if (x.crops) v.crops = x.crops.map(cropName).join(S.lang === "ur" ? "، " : ", ");
    if (x.crop && META.crops[x.crop]) v.stage = f.stage[META.crops[x.crop].stage] || "";
    if (x.k === "zone") v.zone = f.zone[META.regions.find(r => r.id === S.region).zone];
    if (x.k === "heattrend") v.slope = `+${x.slope.toFixed(1)}`;
    const key = "f_" + x.k;
    if (!f[key]) continue;
    (x.good ? good : risk).push(t(key, v));
  }
  return { good: [...new Set(good)], risk: [...new Set(risk)] };
}

/* ---------------------------------------------------------------- questions */
function chips(key, options, label, opts = {}) {
  return el("div", { class: "chips" + (opts.col ? " col" : ""), role: "group", "aria-label": label },
    options.map(([val, text]) => el("button", {
      type: "button", class: "chip", "aria-pressed": String(String(S[key]) === String(val)), "data-k": key,
      "data-v": val, text,
      onclick: () => { S[key] = String(val); saveState(); renderQuestions(key + ":" + val); renderAll(); },
    })));
}
function renderQuestions(focusId) {
  const f = T();
  const box = document.getElementById("questions");
  const q = (n, title, ...body) => el("div", { class: "q reveal in" },
    el("h3", {}, el("span", { class: "n", text: L(n) }), title), ...body);
  box.replaceChildren(
    q(1, t("q1"), chips("region", META.regions.map(r => [r.id, placeName(r.id)]), f.q1)),
    q(2, t("q2"), chips("rot", Object.keys(META.rotations).map(r => [r, rotName(r)]), f.q2, { col: true })),
    q(3, t("q3"), chips("irr", CHOICES.irr.map(v => [v, f.irr[v]]), f.q3),
      el("p", { class: "sub", text: t("q3b") }), chips("wa", CHOICES.wa.map(v => [v, f.wa[v]]), f.q3b)),
    q(4, t("q4"), chips("soil", CHOICES.soil.map(v => [v, f.soil[v]]), f.q4),
      el("p", { class: "sub", text: t("q4b") }), chips("salt", CHOICES.salt.map(v => [v, f.salt[v]]), f.q4b),
      el("p", { class: "sub", text: t("q4c") }), chips("wet", CHOICES.wet.map(v => [v, f.wet[v]]), f.q4c)),
    q(5, t("q5"), chips("pr", CHOICES.pr.map(v => [v, f.pr[v]]), f.q5)),
  );
  if (focusId) {
    const [k, v] = focusId.split(":");
    const b = [...box.querySelectorAll(".chip")].find(x => x.dataset.k === k && x.dataset.v === v);
    if (b) b.focus({ preventScroll: true });
  }
}

/* ---------------------------------------------------------------- result */
function ring(score) {
  const r = 48, c = 2 * Math.PI * r;
  const svg = svgEl("svg", { viewBox: "0 0 112 112", width: 112, height: 112, "aria-hidden": "true" });
  svg.append(svgEl("circle", { class: "bg", cx: 56, cy: 56, r }));
  const fg = svgEl("circle", { class: "fg", cx: 56, cy: 56, r, "stroke-dasharray": c,
                               "stroke-dashoffset": c * (1 - lastScore / 100) });
  svg.append(fg);
  const num = el("b", { text: L(n0(lastScore)) });
  requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute("stroke-dashoffset", c * (1 - score / 100))));
  countTo(num, lastScore, score, 1000);
  lastScore = score;
  return el("div", { class: "ring", role: "img", "aria-label": `${n0(score)}/100` }, svg, num,
            el("small", { text: t("match") }));
}
function countTo(node, from, to, ms) {
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    node.textContent = L(n0(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function calendar(rows) {
  const f = T();
  const months = el("div", { class: "months" }, MONTHS_SHORT[S.lang].map(m => el("span", { text: S.lang === "ur" ? m.slice(0, 3) : m[0] })));
  const box = el("div", { class: "cal" });
  for (const [label, rid] of rows) {
    const track = el("div", { class: "track" });
    const ev = REGION[S.region].evals[`${S.soil}|${S.salt}|${S.wet}`][rid];
    let delay = 0;
    for (const s of ev.cal) {
      const parts = s.yb > s.ya ? [[s.a, 366], [1, s.b]] : [[s.a, s.b]];
      for (const [a, b] of parts) {
        track.append(el("span", {
          class: "seg", text: (b - a) > 40 ? `${META.crops[s.c].emoji} ${cropName(s.c)}` : META.crops[s.c].emoji,
          style: { insetInlineStart: `${(a - 1) / 365 * 100}%`, width: `${(b - a) / 365 * 100}%`,
                   background: CROP_COLORS[s.c], animationDelay: `${delay}ms` },
          title: cropName(s.c),
        }));
        delay += 120;
      }
    }
    box.append(el("div", { class: "row" }, el("span", { text: label }), track));
  }
  box.append(months);
  return el("div", { class: "card fade" }, el("h4", { text: f.cal_h, style: { margin: "0 0 .7rem" } }), box);
}

function renderResult() {
  const f = T();
  const box = document.getElementById("result");
  const region = REGION[S.region];
  if (!region) { box.replaceChildren(el("div", { class: "card loading", text: f.loading })); return; }
  const { ranked, cur, best } = evaluate(region);
  const bestName = rotName(best.rid), curName = rotPlain(cur.rid);
  const gain = n0(best.total - cur.total);
  const { good, risk } = reasons(best, cur);

  let waterPill = null, waterTxt = "";
  if (best !== cur && cur.ev.water) {
    const pct = 100 * (best.ev.water - cur.ev.water) / cur.ev.water;
    waterTxt = Math.abs(pct) < 5 ? t("water_same") : pct < 0 ? t("water_less", { pct: n0(-pct) }) : t("water_more", { pct: n0(pct) });
    waterPill = el("span", { class: "pill", text: waterTxt });
  }
  const verdict = el("div", { class: "card verdict fade" },
    el("div", { class: "top" }, ring(best.total), el("div", {},
      el("div", { class: "kicker", text: t("res_for", { place: placeName(S.region) }) }),
      el("h3", { text: best === cur ? t("keep", { name: bestName }) : t("switch", { name: bestName }) }),
      el("div", { text: best === cur ? t("keep_sub") : t("switch_sub", { current: curName, gain }) }))),
    el("div", { class: "why" }, waterPill,
      el("span", { class: "pill", text: t("irrig", { n: n0(best.ev.water / META.irr_depth) }) }),
      el("span", { class: "pill", text: f.conf[best.ev.conf] })));

  const lists = el("div", { class: "card two fade" },
    el("div", { class: "list good" }, el("h4", { text: f.good_h }),
      el("ul", {}, (good.length ? good : [L(f.none_good)]).slice(0, 4).map(x => el("li", { text: x })))),
    el("div", { class: "list risk" }, el("h4", { text: f.risk_h }),
      el("ul", {}, (risk.length ? risk : [L(f.none_risk)]).slice(0, 4).map(x => el("li", { text: x })))));

  const rows = best === cur ? [[f.cal_now, cur.rid]] : [[f.cal_new, best.rid], [f.cal_now, cur.rid]];

  const opts = el("div", { class: "card opts fade" }, el("h4", { text: f.opts_h, style: { margin: "0 0 .8rem" } }),
    ranked.map(o => {
      const bar = el("i");
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${Math.max(2, o.total)}%`; }));
      return el("div", { class: "o" + (o.ev.gate ? " gate" : "") },
        el("div", { class: "l" }, el("span", {}, rotName(o.rid),
          o === cur ? el("span", { class: "tag", text: f.now_tag }) : null,
          o.ev.gate ? el("span", { class: "tag bad", text: "⛔ " + f.gate_tag }) : null),
          el("b", { text: L(n0(o.total)) })),
        el("div", { class: "bar2" }, bar));
    }));

  const shareTxt = t("share_text", { place: placeName(S.region), best: rotPlain(best.rid), score: n0(best.total),
                                     current: curName, cscore: n0(cur.total), water: waterTxt.replace("💧 ", "") });
  const actions = el("div", { class: "card fade" },
    el("div", { class: "actions" },
      el("a", { class: "btn wa", href: "https://wa.me/?text=" + encodeURIComponent(shareTxt + "\n" + location.href),
                target: "_blank", rel: "noopener noreferrer", text: f.share }),
      el("button", { class: "btn line", type: "button", text: f.print, onclick: () => window.print() })),
    el("p", { class: "muted", text: f.officer, style: { margin: ".8rem 0 0" } }));

  box.replaceChildren(verdict, lists, calendar(rows), opts, actions);
}

/* ---------------------------------------------------------------- weather */
async function getForecast(r) {
  const hit = FORECAST[r.id];
  if (hit && Date.now() - hit.at < 3600e3) return hit.data;
  const u = "https://api.open-meteo.com/v1/forecast?latitude=" + r.lat + "&longitude=" + r.lon +
    "&forecast_days=7&timezone=Asia%2FKarachi&daily=temperature_2m_max,temperature_2m_min,precipitation_sum";
  const res = await fetch(u);
  if (!res.ok) throw new Error(res.status);
  const d = (await res.json()).daily;
  const data = d.time.map((x, i) => ({ date: new Date(x + "T12:00:00"), tmax: d.temperature_2m_max[i],
                                         tmin: d.temperature_2m_min[i], rain: d.precipitation_sum[i] || 0 }));
  FORECAST[r.id] = { at: Date.now(), data };
  return data;
}
async function renderWeather() {
  const r = META.regions.find(x => x.id === S.region);
  document.getElementById("wxTitle").textContent = t("wx_title", { place: placeName(r.id) });
  const week = document.getElementById("week"), tips = document.getElementById("tips");
  let fc;
  try { fc = await getForecast(r); } catch (e) {
    week.replaceChildren(el("p", { class: "muted", text: t("wx_none") })); tips.replaceChildren(); return;
  }
  if (r.id !== S.region) return; // the farmer switched district while loading
  week.replaceChildren(...fc.map((d, i) => el("div", { class: "day", style: { animationDelay: `${i * 60}ms` } },
    el("div", { class: "d", text: dayLabel(d.date) }),
    el("div", { class: "i", text: d.rain >= 5 ? "🌧️" : d.rain >= 1 ? "🌦️" : d.tmax >= 40 ? "🔥" : "☀️",
                style: { animationDelay: `${i * 0.3}s` } }),
    el("div", { class: "t", text: L(`${n0(d.tmax)}° / ${n0(d.tmin)}°`) }),
    el("div", { class: "r", text: L(`${n0(d.rain)} `) + T().unit_mm }))));
  const out = [];
  const heavy = fc.find(d => d.rain >= 30);
  if (heavy) out.push(t("wx_heavy", { mm: n0(heavy.rain), day: dayLabel(heavy.date) }));
  let cum = 0, rainDay = null;
  for (const d of fc) { cum += d.rain; if (cum >= 10 && !rainDay) rainDay = d; }
  if (rainDay) out.push(t("wx_rain", { mm: n0(fc.slice(0, fc.indexOf(rainDay) + 1).reduce((a, d) => a + d.rain, 0)), day: dayLabel(rainDay.date) }));
  const hot = fc.filter(d => d.tmax >= 40);
  if (hot.length) out.push(t("wx_heat", { t: n0(Math.max(...hot.map(d => d.tmax))), day: dayLabel(hot[0].date) }));
  const cold = fc.filter(d => d.tmin <= 2);
  if (cold.length) out.push(t("wx_cold", { t: n0(Math.min(...cold.map(d => d.tmin))), day: dayLabel(cold[0].date) }));
  if (cum < 2) out.push(t("wx_dry"));
  tips.replaceChildren(...out.map(x => el("li", { text: x })));
}

/* ---------------------------------------------------------------- charts (small SVG, no library) */
function chart(id, series, opt = {}) {
  const box = document.getElementById(id);
  const W = 600, H = 320, P = { l: 44, r: 14, t: 16, b: 34 };
  const all = series.flatMap(s => s.data.filter(v => v != null));
  const lo = opt.min ?? Math.min(0, ...all), hi = (opt.max ?? Math.max(...all)) * 1.08 || 1;
  const x = i => P.l + (i + 0.5) * (W - P.l - P.r) / 12;
  const y = v => H - P.b - (v - lo) / (hi - lo) * (H - P.t - P.b);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.label || "", direction: "ltr" });
  const m = new Date().getMonth(), bw = (W - P.l - P.r) / 12;
  svg.append(svgEl("rect", { class: "now", x: P.l + m * bw, y: P.t, width: bw, height: H - P.t - P.b, rx: 6 }));
  for (let k = 0; k <= 4; k++) {
    const v = lo + (hi - lo) * k / 4;
    svg.append(svgEl("line", { class: "grid", x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }));
    const tx = svgEl("text", { x: P.l - 6, y: y(v) + 4, "text-anchor": "end" });
    tx.textContent = L(opt.fmt ? opt.fmt(v) : n0(v));
    svg.append(tx);
  }
  MONTHS_SHORT[S.lang].forEach((mm, i) => {
    const tx = svgEl("text", { x: x(i), y: H - 10, "text-anchor": "middle" });
    tx.textContent = S.lang === "ur" ? mm.slice(0, 3) : mm;
    svg.append(tx);
  });
  const nb = series.filter(s => s.type === "bar").length;
  let bi = 0;
  for (const s of series) {
    if (s.type === "bar") {
      const w = bw * 0.7 / nb;
      s.data.forEach((v, i) => {
        if (v == null) return;
        svg.append(svgEl("rect", { class: "br", x: x(i) - bw * 0.35 + bi * w, y: y(Math.max(v, lo)), width: w - 2,
                                   height: Math.max(0, y(lo) - y(Math.max(v, lo))), rx: 3, fill: s.color,
                                   style: `animation-delay:${i * 50}ms` }));
      });
      bi++;
    } else {
      const pts = s.data.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
      const path = svgEl("path", { class: "ln", d: "M" + pts.join("L"), stroke: s.color });
      svg.append(path);
      s.data.forEach((v, i) => { if (v != null) svg.append(svgEl("circle", { cx: x(i), cy: y(v), r: 3.5, fill: s.color })); });
      requestAnimationFrame(() => { const len = path.getTotalLength(); path.style.setProperty("--len", len); });
    }
  }
  box.classList.remove("in");
  box.replaceChildren(svg);
  observe(box);
}
function legend(id, items) {
  document.getElementById(id).replaceChildren(...items.map(([c, txt]) => el("span", {}, el("i", { style: { background: c } }), txt)));
}

function renderLand() {
  const f = T(), reg = REGION[S.region];
  const place = placeName(S.region);
  document.getElementById("landTitle").textContent = t("land_title", { place });
  if (!reg) return;
  const c = reg.climate, mo = c.month, m = new Date().getMonth();
  document.getElementById("landIntro").textContent = t("land_intro", { a: c.years[0], b: c.years[1] });
  const kpi = (v, label) => el("div", { class: "kpi" }, el("b", { text: L(v) }), el("span", { text: label }));
  const now = new Date();
  const sowNow = [], next = [];
  for (const [cid, cr] of Object.entries(META.crops)) {
    const [sm, sd] = cr.sow[0].split("-").map(Number), [em, ed] = cr.sow[1].split("-").map(Number);
    const a = new Date(now.getFullYear(), sm - 1, sd), b = new Date(now.getFullYear(), em - 1, ed, 23);
    if (now >= a && now <= b) sowNow.push(cropName(cid));
    else {
      const nx = a > now ? a : new Date(now.getFullYear() + 1, sm - 1, sd);
      if ((nx - now) / 864e5 <= 75) next.push([nx, cropName(cid)]);
    }
  }
  const lines = [el("h3", { text: t("month_h", { month: MONTHS[S.lang][m] }) }),
    el("div", {}, t("month_line", { tmax: n0(mo.tmax[m]), tmin: n0(mo.tmin[m]), rain: n0(mo.rain[m]), et0: n0(mo.et0[m]) })),
    el("div", { class: "kpis" }, kpi(`${n0(mo.tmax[m])}°`, f.k_day), kpi(`${n0(mo.tmin[m])}°`, f.k_night),
      kpi(`${n0(mo.rain[m])} ${S.lang === "ur" ? f.unit_mm : "mm"}`, f.k_rain),
      kpi(`${n0(mo.et0[m])} ${S.lang === "ur" ? f.unit_mm : "mm"}`, f.k_need))];
  if (sowNow.length) lines.push(el("p", { style: { margin: ".9rem 0 0" }, text: t("sow_now", { crops: sowNow.join(S.lang === "ur" ? "، " : ", ") }) }));
  if (next.length) {
    const d0 = new Date(Math.min(...next.map(x => x[0])));
    lines.push(el("p", { style: { margin: ".3rem 0 0" }, text: t("sow_next", {
      crops: next.filter(x => +x[0] === +d0).map(x => x[1]).join(S.lang === "ur" ? "، " : ", "),
      date: L(`${d0.getDate()} ${MONTHS[S.lang][d0.getMonth()]}`) }) }));
  }
  document.getElementById("monthCard").replaceChildren(...lines);

  chart("chTemp", [{ type: "line", data: mo.tmax, color: "#d9572b" }, { type: "line", data: mo.tmin, color: "#3f8fd0" }],
        { fmt: v => `${n0(v)}°` });
  legend("lgTemp", [["#d9572b", f.lg_day], ["#3f8fd0", f.lg_night]]);
  const rainSeries = [{ type: "bar", data: mo.rain, color: "#5aa7e0" }];
  const lg = [["#5aa7e0", f.lg_rain]];
  if (c.imerg && c.imerg.clim) { rainSeries.push({ type: "bar", data: c.imerg.clim, color: "#9b7fd6" }); lg.push(["#9b7fd6", f.lg_imerg]); }
  rainSeries.push({ type: "line", data: mo.et0, color: "#d39a1e" });
  lg.push(["#d39a1e", f.lg_need]);
  chart("chRain", rainSeries);
  legend("lgRain", lg);
  if (c.ndvi) chart("chGreen", [{ type: "line", data: c.ndvi, color: "#3d9b4a" }], { min: 0, max: Math.max(...c.ndvi.filter(Boolean)), fmt: v => v.toFixed(2) });
  if (c.smap) {
    chart("chSoil", [{ type: "bar", data: c.smap, color: "#7a5230" }], { min: 0, fmt: v => v.toFixed(2) });
    document.getElementById("lgSoil").textContent = t("lg_soil", { n: c.smap_days });
  } else {
    document.getElementById("chSoil").replaceChildren();
    document.getElementById("lgSoil").textContent = t("lg_soil_none");
  }

  const tr = c.trend, cards = [];
  const trend = (title, k, unit) => {
    const x = tr[k];
    if (!x) return null;
    const ey = L(x.ey), ly = L(x.ly);
    return el("div", { class: "trend reveal in" }, el("div", { class: "muted", text: title }),
      el("div", { class: "big", text: L(S.lang === "ur" ? `${n0(x.late)}${unit} ← ${n0(x.early)}` : `${n0(x.early)} → ${n0(x.late)}${unit}`) }),
      el("div", { class: "muted", text: t("tr_from", { early: n0(x.early) + unit, late: n0(x.late) + unit, ey, ly }) }));
  };
  const mm = " " + (S.lang === "ur" ? f.unit_mm : "mm");
  cards.push(trend(f.tr_temp, "tmax_mean", "°"), trend(f.tr_rain, "rain", mm), trend(f.tr_hot, "hot_days", " " + f.unit_days));
  if (c.imerg) {
    const diff = n0(Math.abs(c.imerg.bias));
    cards.push(el("div", { class: "trend reveal in" }, el("div", { class: "muted", text: f.tr_check }),
      el("div", { class: "big", text: t("tr_check_v", { diff }) }), el("div", { class: "muted", text: t("tr_check_t", { diff }) })));
  }
  document.getElementById("trends").replaceChildren(...cards.filter(Boolean));
}

/* ---------------------------------------------------------------- static text, how-it-works */
function renderStatic() {
  const f = T();
  document.documentElement.lang = S.lang;
  document.documentElement.dir = f.dir;
  document.title = f.title;
  document.querySelectorAll("[data-t]").forEach(n => { n.textContent = L(f[n.dataset.t]); });
  const lb = document.getElementById("langBtn");
  lb.replaceChildren(el("span", { class: f.otherCls, text: "🌐 " + f.other }));
  document.getElementById("steps").replaceChildren(...f.steps.map(([ic, h, p], i) =>
    el("div", { class: "step reveal", style: { transitionDelay: `${i * 90}ms` } }, el("span", { class: "ic", text: ic, style: { animationDelay: `${i * .4}s` } }),
      el("h4", { text: L(h) }), el("p", { text: L(p) }))));
  document.getElementById("sources").replaceChildren(...f.sources.map(([h, p]) =>
    el("div", { class: "source reveal" }, el("b", { text: h }), el("span", { text: L(p) }))));
  document.getElementById("built").textContent = t("built", { date: META.built });
  document.querySelectorAll(".count").forEach(n => { n.textContent = L(n.dataset.to); });
  observeAll();
}

/* ---------------------------------------------------------------- hero animation */
function buildHero() {
  const g = document.getElementById("wheat");
  const rnd = (a, b) => a + Math.random() * (b - a);
  const n = window.innerWidth < 700 ? 48 : 95;
  for (let i = 0; i < n; i++) {
    const x = (i + rnd(-0.3, 0.3)) * 1440 / n, base = rnd(196, 232), h = rnd(46, 92);
    const st = svgEl("g", { class: "stalk" });
    st.style.animationDuration = `${rnd(2.6, 4.8).toFixed(2)}s`;
    st.style.animationDelay = `${(-rnd(0, 4)).toFixed(2)}s`;
    st.append(svgEl("path", { d: `M${x} ${base} Q${x + rnd(-6, 6)} ${base - h / 2} ${x} ${base - h}` }));
    for (let k = 0; k < 5; k++) {
      const yy = base - h + k * 6;
      st.append(svgEl("ellipse", { cx: x - 3, cy: yy, rx: 2.6, ry: 5, transform: `rotate(-25 ${x - 3} ${yy})` }));
      st.append(svgEl("ellipse", { cx: x + 3, cy: yy + 3, rx: 2.6, ry: 5, transform: `rotate(25 ${x + 3} ${yy + 3})` }));
    }
    g.append(st);
  }
  const pol = document.getElementById("pollen");
  for (let i = 0; i < 22; i++) {
    pol.append(el("span", { style: { left: `${rnd(0, 100)}%`, animationDuration: `${rnd(7, 14)}s`,
                                      animationDelay: `${-rnd(0, 14)}s`, transform: `scale(${rnd(.5, 1.2)})` } }));
  }
  const counters = document.querySelectorAll(".count");
  counters.forEach(nd => countTo(nd, 0, Number(nd.dataset.to), 1400));
}

/* ---------------------------------------------------------------- reveal on scroll */
let IO = null;
function observe(node) {
  if (!IO) { node.classList.add("in"); return; }
  IO.observe(node);
}
function observeAll() { document.querySelectorAll(".reveal:not(.in), .chart:not(.in)").forEach(observe); }

/* ---------------------------------------------------------------- data + boot */
async function loadRegion(id) {
  if (REGION[id]) return REGION[id];
  const res = await fetch(`data/region_${id}.json`);
  if (!res.ok) throw new Error(res.status);
  REGION[id] = await res.json();
  return REGION[id];
}

let renderToken = 0;
async function renderAll() {
  const token = ++renderToken;
  renderResult();
  renderWeather();
  try {
    await loadRegion(S.region);
  } catch (e) {
    document.getElementById("result").replaceChildren(el("div", { class: "card", text: t("error") }));
    return;
  }
  if (token !== renderToken) return;
  renderResult();
  renderLand();
}

async function boot() {
  if ("IntersectionObserver" in window) {
    IO = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); IO.unobserve(e.target); }
    }), { threshold: 0.12 });
  }
  buildHero();
  try {
    const res = await fetch("data/meta.json");
    META = await res.json();
  } catch (e) {
    document.getElementById("result").textContent = I18N.en.error + " · " + I18N.ur.error;
    return;
  }
  validate();
  saveState();
  renderStatic();
  renderQuestions();
  document.getElementById("langBtn").addEventListener("click", () => {
    S.lang = S.lang === "ur" ? "en" : "ur";
    saveState();
    renderStatic();
    renderQuestions();
    lastScore = 0;
    renderAll();
  });
  renderAll();
  // preload the other districts in the background so switching is instant
  setTimeout(() => META.regions.forEach(r => loadRegion(r.id).catch(() => {})), 1500);
}

document.addEventListener("DOMContentLoaded", boot);
