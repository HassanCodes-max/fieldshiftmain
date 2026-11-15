import { Suspense } from "react";
import { MonthChart } from "@/components/charts/MonthChart";
import { AnomalyGrid, RiskGrid } from "@/components/charts/Heatmap";
import { TimeSeries } from "@/components/charts/TimeSeries";
import { ButtonLink, Container, OriginBadge, PageHead, SectionTitle, Skeleton, Stat } from "@/components/ui/primitives";
import { factText } from "@/lib/i18n/facts";
import { digits, districtName, fmtDate, fmtInt, fmtNum, getDict, t, type Lang } from "@/lib/i18n";
import type { LandReport } from "@/lib/server/land";
import { Forecast } from "./Forecast";

const doyMonth = (iso: string) => Number(iso.slice(5, 7));

export function LandReportView({ lang, r }: { lang: Lang; r: LandReport }) {
  const d = getDict(lang);
  const L = d.land;
  const loc = r.location;
  const place = loc.region ? districtName(lang, loc.region) : `${fmtNum(lang, loc.lat, 2)}°, ${fmtNum(lang, loc.lon, 2)}°`;
  const clim = r.clim as Record<string, number>[];
  const hottest = clim.reduce((a, b) => (b.tmax > a.tmax ? b : a));
  const annual = (r.annual as Record<string, number>[]).filter((a) => a.year >= r.years[0] && a.year <= r.years[1]);
  const rainYr = annual.reduce((a, x) => a + x.rain, 0) / annual.length;
  const et0Yr = annual.reduce((a, x) => a + x.et0, 0) / annual.length;
  const ndvi = r.ndvi;
  const word = (x: number | null, n: number | null) => (x === null || n === null ? L.near : x - n > 0.03 ? L.above : x - n < -0.03 ? L.below : L.near);
  const adviceHref = `/${lang}/advisor?${loc.region ? `r=${loc.region}` : `ll=${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`}`;
  const bareShade = ndvi?.windows.flatMap((w) => {
    const a = doyMonth(w.start);
    const b = doyMonth(w.end);
    return b >= a ? [{ from: a, to: b, color: "rgba(162,78,45,.10)" }] : [{ from: a, to: 12, color: "rgba(162,78,45,.10)" }, { from: 1, to: b, color: "rgba(162,78,45,.10)" }];
  });
  const tr = r.trends as Record<string, { perDecade: number | null; earlyMean: number | null; lateMean: number | null; earlyYears: string; lateYears: string }>;
  const sk = r.outlook?.skill[0];

  return (
    <>
      <PageHead eyebrow={d.nav.land} title={t(L.title, { place })} lead={t(L.lead, { a: fmtInt(lang, r.years[0]), b: fmtInt(lang, r.years[1]) })}>
        <div className="mt-5 flex flex-wrap gap-2 text-[0.85rem]">
          {loc.zone && <span className="rounded-full bg-beige-200 px-3 py-1 text-soil-800">{(d.zones as Record<string, string>)[loc.zone] ?? loc.zone}</span>}
          <span className="tnum rounded-full bg-beige-200 px-3 py-1 text-soil-800">{fmtNum(lang, loc.lat, 2)}° {lang === "ur" ? "شمال" : "N"}، {fmtNum(lang, loc.lon, 2)}° {lang === "ur" ? "مشرق" : "E"}</span>
          {loc.srtm && <span className="rounded-full bg-beige-200 px-3 py-1 text-soil-800">{t(L.terrainText, { e: fmtNum(lang, loc.srtm.elevation_m), s: fmtNum(lang, loc.srtm.slope_pct, 2) })}</span>}
          {loc.landcover && <span className="rounded-full bg-olive-100 px-3 py-1 text-olive-800">{t(L.landcoverText, { c: loc.landcover.is_cropland ? (lang === "ur" ? "زرعی زمین" : "Cropland") : loc.landcover.class_name, pct: fmtNum(lang, loc.landcover.cropland_fraction * 100), y: fmtInt(lang, loc.landcover.year) })}</span>}
        </div>
        <div className="mt-6"><ButtonLink href={adviceHref}>{L.adviceCta}</ButtonLink></div>
      </PageHead>

      <Container className="space-y-14 py-10">
        {loc.kind === "custom" && <p className="rounded-xl bg-water-100 px-4 py-3 text-[0.92rem] text-water-800">{L.customNote}</p>}

        {/* KPIs */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label={L.kpis.ndvi} badge={<OriginBadge kind="observed" label={d.src.modis} />}
            value={ndvi ? fmtNum(lang, ndvi.latest.ndvi, 2) : "—"}
            sub={ndvi ? t(L.ndviVs, { word: word(ndvi.latest.ndvi, ndvi.latest.normal), normal: fmtNum(lang, ndvi.latest.normal, 2), date: fmtDate(lang, ndvi.latest.date) }) : L.noNdvi} />
          <Stat label={L.kpis.smap} badge={<OriginBadge kind="observed" label={d.src.smap} />}
            value={r.smap ? <span>{fmtNum(lang, r.smap.latest.value, 2)} <span className="text-base text-ink-500">m³/m³</span></span> : "—"}
            sub={r.smap ? t(L.smapVs, { word: r.smap.latest.value! > r.smap.latest.monthMean! * 1.1 ? L.wetter : r.smap.latest.value! < r.smap.latest.monthMean! * 0.9 ? L.drier : L.nearSmap, mean: fmtNum(lang, r.smap.latest.monthMean, 2), date: fmtDate(lang, r.smap.latest.date) }) : L.noSmap} />
          <Stat label={L.kpis.heat} badge={<OriginBadge kind="model" label={d.src.power} />} value={`${fmtNum(lang, hottest.tmax, 1)} °C`} sub={t(L.heatSub, { month: d.months[hottest.month - 1] })} />
          <Stat label={L.kpis.rain} badge={<OriginBadge kind="model" label={d.src.power} />} value={`${fmtNum(lang, rainYr)} ${d.common.mm}`} sub={t(L.rainSub, { et0: fmtNum(lang, et0Yr) })} />
          <Stat label={L.kpis.data} value={fmtDate(lang, r.quality.last)} sub={t(L.dataSub, { years: fmtNum(lang, r.quality.completeYears) })} />
        </section>

        {/* insights + outlook */}
        <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <SectionTitle>{L.insights}</SectionTitle>
            <ul className="space-y-3">
              {r.insights.map((f, i) => (
                <li key={i} className="card px-4 py-3.5 text-[0.98rem] leading-relaxed text-ink-700">{factText(f, lang)}</li>
              ))}
            </ul>
          </div>
          <div id="outlook" className="scroll-mt-24">
            <SectionTitle aside={<OriginBadge kind="forecast" label={d.mlTag} />}>{L.outlookTitle}</SectionTitle>
            {r.outlook ? (
              <div className="rounded-2xl bg-forest-900 p-5 text-cream">
                <p className="leading-relaxed text-beige-100">{t(L.outlookText, { date: fmtDate(lang, r.outlook.lastDate), last: fmtNum(lang, r.outlook.lastNdvi, 2), normal: fmtNum(lang, r.outlook.lastClim, 2), word: r.outlook.word === "above" ? L.above : r.outlook.word === "below" ? L.below : L.near })}</p>
                <table className="mt-4 w-full text-[0.88rem]">
                  <tbody>
                    {r.outlook.table.map((row) => (
                      <tr key={row.lead} className="border-t border-cream/15">
                        <td className="py-2 text-beige-200">{fmtDate(lang, row.date)}</td>
                        <td className="tnum py-2 text-end font-display text-lg">{fmtNum(lang, row.ndvi, 2)}</td>
                        <td className="tnum py-2 ps-3 text-end text-beige-300">{fmtNum(lang, row.lo, 2)}–{fmtNum(lang, row.hi, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sk && <p className="mt-3 text-[0.8rem] text-beige-300">{t(L.outlookSkill, { a: fmtInt(lang, r.outlook.trainedOn[0]), b: fmtInt(lang, r.outlook.trainedOn[1]), pct: fmtNum(lang, (sk.vsPersist ?? 0) * 100) })}</p>}
              </div>
            ) : <p className="card p-4 text-ink-500">{L.noNdvi}</p>}
          </div>
        </section>

        {/* seasonal risk */}
        <section>
          <SectionTitle aside={<span className="text-[0.85rem] text-ink-500">{L.riskNote}</span>}>{L.risk}</SectionTitle>
          <div className="card p-4">
            <RiskGrid lang={lang} rows={(["heat", "deficit", "drysoil", "heavyrain", "cold", "lowveg"] as const)
              .filter((k) => r.stress.some((s) => s.cells[k]))
              .map((k) => ({ key: k, label: L.stress[k], levels: r.stress.map((s) => s.cells[k]?.level ?? null) }))} />
          </div>
        </section>

        {/* climate charts */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-3 font-display text-lg text-forest-900">{L.temp}</h3>
            <MonthChart lang={lang} unit="°C" label={L.temp} series={[
              { kind: "line", values: clim.map((c) => c.tmax), color: "#a24e2d", label: L.lgDay },
              { kind: "line", values: clim.map((c) => c.tmin), color: "#3e6e7e", label: L.lgNight },
            ]} />
          </div>
          <div className="card p-5">
            <h3 className="mb-3 font-display text-lg text-forest-900">{L.rainEt}</h3>
            <MonthChart lang={lang} unit={d.common.mm} label={L.rainEt} series={[
              { kind: "bar", values: clim.map((c) => c.rain), color: "#79a3b0", label: L.lgRain },
              ...(r.crosscheck ? [{ kind: "bar" as const, values: r.crosscheck.clim.map((c) => c.imerg), color: "#2f5866", label: L.lgImerg }] : []),
              { kind: "line", values: clim.map((c) => c.et0), color: "#c8962e", label: L.lgEt0 },
            ]} />
          </div>
          {ndvi && (
            <div className="card p-5">
              <h3 className="mb-3 font-display text-lg text-forest-900">{L.ndviCycle}</h3>
              <MonthChart lang={lang} digits={2} min={0} label={L.ndviCycle} shade={bareShade} series={(() => {
                const byMonth = (k: "ndvi" | "p25" | "p75") => Array.from({ length: 12 }, (_, i) => {
                  const v = ndvi.clim.filter((c) => c.month === i + 1).map((c) => c[k]).filter((x): x is number => x !== null);
                  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
                });
                return [
                  { kind: "band" as const, lower: byMonth("p25"), upper: byMonth("p75"), color: "#76833f", label: L.lgBand },
                  { kind: "line" as const, values: byMonth("ndvi"), color: "#4a5424", label: L.lgNdvi },
                ];
              })()} />
              <p className="mt-2 text-[0.82rem] text-ink-500"><span className="me-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-clay-600/20 align-middle" />{L.lgBare} · {L.ndviNote}</p>
            </div>
          )}
          {ndvi && (
            <div className="card p-5">
              <h3 className="mb-3 font-display text-lg text-forest-900">{L.ndviRecord}</h3>
              <TimeSeries lang={lang} dates={ndvi.series.dates} values={ndvi.series.values} color="#5e6b2f" label={L.ndviRecord} threshold={ndvi.threshold} />
            </div>
          )}
          {r.smap && (
            <div className="card p-5">
              <h3 className="mb-3 font-display text-lg text-forest-900">{L.smapTitle}</h3>
              <MonthChart lang={lang} digits={2} min={0} unit="m³/m³" label={L.smapTitle} series={[{ kind: "bar", values: r.smap.monthly, color: "#86613f", label: d.src.smap }]} />
              <p className="mt-2 text-[0.82rem] text-ink-500">{t(L.smapNote, { n: fmtNum(lang, r.smap.nDays), first: fmtDate(lang, r.smap.first), rec: r.smap.recommendedShare === null ? "—" : `${fmtNum(lang, r.smap.recommendedShare * 100)}%` })}</p>
            </div>
          )}
          {r.crosscheck && (
            <div className="card p-5">
              <h3 className="mb-3 font-display text-lg text-forest-900">{L.crossTitle}</h3>
              <p className="tnum font-display text-4xl text-forest-900">{fmtNum(lang, Math.abs(r.crosscheck.biasPct ?? 0))}%</p>
              <p className="mt-3 leading-relaxed text-ink-700">
                {r.crosscheck.agrees
                  ? t(L.crossOk, { diff: fmtNum(lang, Math.ceil(Math.abs(r.crosscheck.biasPct ?? 0))), r: fmtNum(lang, r.crosscheck.r, 2) })
                  : t(L.crossWarn, { diff: fmtNum(lang, Math.abs(r.crosscheck.biasPct ?? 0)), dir: (r.crosscheck.biasPct ?? 0) > 0 ? L.more : L.less })}
              </p>
              <p className="mt-2 text-[0.82rem] text-ink-500">{d.src.power} {fmtNum(lang, r.crosscheck.powerMm)} {d.common.mm} · {d.src.gpm} {fmtNum(lang, r.crosscheck.imergMm)} {d.common.mm} · {digits(lang, r.crosscheck.years)}</p>
            </div>
          )}
        </section>

        {/* trends */}
        <section>
          <SectionTitle>{L.trendsTitle}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([["tmaxMean", L.trendTemp, " °C", 1], ["rain", L.trendRain, ` ${d.common.mm}`, 0], ["hotDays", L.trendHot, ` ${d.common.days}`, 0], ["wheatHeatDays", L.trendWheat, ` ${d.common.days}`, 0]] as const).map(([k, label, unit, dg]) => {
              const x = tr[k];
              return (
                <div key={k} className="card p-4">
                  <p className="text-sm text-ink-500">{label}</p>
                  <p className="tnum mt-1 font-display text-2xl text-ink-900 ltr-nums" dir="ltr">{fmtNum(lang, x.earlyMean, dg)} → {fmtNum(lang, x.lateMean, dg)}<span className="text-base text-ink-500">{unit}</span></p>
                  <p className="mt-1 text-[0.8rem] text-ink-500"><span className="ltr-nums">{digits(lang, x.earlyYears)} → {digits(lang, x.lateYears)}</span> · {t(L.perDecade, { v: `${(x.perDecade ?? 0) > 0 ? "+" : ""}${fmtNum(lang, x.perDecade, dg === 0 ? 1 : 2)}` })}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-1 font-display text-lg text-forest-900">{L.anomalyTitle} — {L.anomalyTemp}</h3>
              <p className="mb-3 text-[0.8rem] text-ink-500"><span className="text-clay-700">■ {L.warmer}</span> · <span className="text-water-700">■ {L.cooler}</span></p>
              <AnomalyGrid lang={lang} rows={r.anomalies.map((a) => ({ year: a.year, values: a.tmax }))} scale={3} unit="°C" hot />
            </div>
            <div className="card p-5">
              <h3 className="mb-1 font-display text-lg text-forest-900">{L.anomalyTitle} — {L.anomalyRain}</h3>
              <p className="mb-3 text-[0.8rem] text-ink-500"><span className="text-water-700">■ {L.wetterA}</span> · <span className="text-harvest-700">■ {L.drierA}</span></p>
              <AnomalyGrid lang={lang} rows={r.anomalies.map((a) => ({ year: a.year, values: a.rain }))} scale={60} unit={d.common.mm} hot={false} />
            </div>
          </div>
        </section>

        {/* live forecast */}
        <section>
          <SectionTitle aside={<OriginBadge kind="forecast" label={d.src.openmeteo} />}>{L.forecastTitle}</SectionTitle>
          <Suspense fallback={<Skeleton className="h-40" />}>
            <Forecast lang={lang} lat={loc.lat} lon={loc.lon} />
          </Suspense>
        </section>

        {loc.region && (
          <p>
            <a href={`/api/land/csv?region=${loc.region}`} download className="text-[0.95rem] font-medium text-forest-700 underline underline-offset-4">{L.csv}</a>
          </p>
        )}
      </Container>
    </>
  );
}
