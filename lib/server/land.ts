import "server-only";
import {
  annualSummary, climatology, completeYears, dataQuality, headlineInsights, iso, lowVegetationWindows, ndviByMonth,
  ndviClimatology, outlook, parseISO, rainCrosscheck, recentYears, seasonalPeaks, stressMatrix, toMonthly, trends, ymd,
  type CrossCheck,
} from "@/lib/engine";
import { getKnowledge, getNdviModel } from "./data";
import { dailyFor, type LocationData } from "./location";

const fin = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

async function build(loc: LocationData) {
  const K = await getKnowledge();
  const C = K.constants;
  const daily = await dailyFor(loc, { temp: 0, rainPct: 0 });
  const allYears = completeYears(daily);
  const years = recentYears(allYears, C.BASELINE_YEARS);
  const monthly = toMonthly(daily);
  const clim = climatology(monthly, years);
  const annual = annualSummary(daily, allYears);
  const tr = trends(annual);
  const crosscheck: CrossCheck | null = rainCrosscheck(monthly, loc.imerg, years, C);

  let ndvi = null;
  let outlookOut = null;
  let nmonth: Map<number, number> | null = null;
  if (loc.ndvi?.length) {
    const nclim = ndviClimatology(loc.ndvi);
    nmonth = ndviByMonth(nclim);
    const { windows, threshold } = lowVegetationWindows(nclim);
    const last = loc.ndvi[loc.ndvi.length - 1];
    const normal = nclim.find((c) => c.slot === last.slot)?.ndvi ?? NaN;
    ndvi = {
      clim: nclim.map((c) => ({ slot: c.slot, doy: c.doy, month: c.month, ndvi: fin(c.ndvi), p25: fin(c.p25), p75: fin(c.p75) })),
      windows: windows.map((w) => ({ start: iso(w.start), end: iso(w.end), min: fin(w.minNdvi) })),
      threshold: fin(threshold),
      latest: { date: iso(last.day), ndvi: fin(last.ndvi), normal: fin(normal) },
      series: { dates: loc.ndvi.map((p) => iso(p.day)), values: loc.ndvi.map((p) => fin(p.ndvi)) },
      peaks: seasonalPeaks(loc.ndvi).map((p) => ({ year: p.year, rabi: fin(p.rabiPeak), kharif: fin(p.kharifPeak) })),
    };
    const model = await getNdviModel();
    const o = outlook(model, loc.region, loc.ndvi);
    if (o) {
      outlookOut = {
        lastDate: iso(o.lastDay), lastNdvi: fin(o.lastNdvi), lastClim: fin(o.lastClim), word: o.word, meanAnomaly: fin(o.meanAnomaly),
        table: o.table.map((r) => ({ lead: r.lead, date: iso(r.day), ndvi: fin(r.ndvi), lo: fin(r.lo), hi: fin(r.hi), clim: fin(r.clim) })),
        skill: model.skill.map((s) => ({ days: s.days, mae: fin(s.mae_model), vsPersist: fin(s.skill_vs_persist), vsNormal: fin(s.skill_vs_normal), n: s.n })),
        trainedOn: [model.trainedOn[0], model.trainedOn.at(-1)!],
      };
    }
  }

  let smap = null;
  if (loc.smap?.dates.length) {
    const s = loc.smap;
    const byMonth = Array.from({ length: 12 }, () => [] as number[]);
    s.dates.forEach((d, i) => byMonth[ymd(parseISO(d)).m - 1].push(s.sm[i]));
    const monthMean = byMonth.map((v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN));
    const li = s.dates.length - 1;
    const lm = ymd(parseISO(s.dates[li])).m;
    smap = {
      monthly: monthMean.map(fin), nDays: s.dates.length,
      recommendedShare: s.rec ? s.rec.filter(Boolean).length / s.rec.length : null,
      latest: { date: s.dates[li], value: fin(s.sm[li]), monthMean: fin(monthMean[lm - 1]) },
      first: s.dates[0],
    };
  }

  // year x month anomaly grid (vs. the climatology of the scoring years)
  const climBy = new Map(clim.map((c) => [c.month, c]));
  const anomalies = allYears.map((y) => ({
    year: y,
    tmax: Array.from({ length: 12 }, (_, i) => {
      const r = monthly.find((m) => m.year === y && m.month === i + 1);
      return r ? fin(r.tmax - (climBy.get(i + 1)?.tmax ?? NaN)) : null;
    }),
    rain: Array.from({ length: 12 }, (_, i) => {
      const r = monthly.find((m) => m.year === y && m.month === i + 1);
      return r ? fin(r.rain - (climBy.get(i + 1)?.rain ?? NaN)) : null;
    }),
  }));

  const q = dataQuality(daily);
  return {
    location: { key: loc.key, kind: loc.kind, region: loc.region, name: loc.name, lat: loc.lat, lon: loc.lon, zone: loc.zone, srtm: loc.srtm, landcover: loc.landcover, powerSource: loc.powerSource },
    quality: { first: iso(q.firstDay), last: iso(q.lastDay), nDays: q.nDays, missingRaw: q.missingDaysRaw, stillMissing: q.stillMissingAfterFill, completeYears: q.completeYears.length },
    years: [years[0], years.at(-1)!] as [number, number],
    clim: clim.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === "month" ? v : fin(v)]))) as Record<string, number | null>[],
    annual: annual.map((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k === "year" ? v : fin(v)]))) as Record<string, number | null>[],
    trends: Object.fromEntries(Object.entries(tr).map(([k, v]) => [k, { ...v, perDecade: fin(v.perDecade), r2: fin(v.r2), earlyMean: fin(v.earlyMean), lateMean: fin(v.lateMean) }])),
    insights: headlineInsights(clim, annual, tr, C),
    stress: stressMatrix(clim, nmonth, C),
    ndvi,
    outlook: outlookOut,
    smap,
    crosscheck: crosscheck && {
      powerMm: fin(crosscheck.powerMm), imergMm: fin(crosscheck.imergMm), biasPct: fin(crosscheck.biasPct), r: fin(crosscheck.rMonthly),
      nMonths: crosscheck.nMonths, years: crosscheck.years, agrees: crosscheck.agrees,
      clim: crosscheck.clim.map((c) => ({ month: c.month, power: fin(c.power), imerg: fin(c.imerg) })),
    },
    anomalies,
  };
}

export type LandReport = Awaited<ReturnType<typeof build>>;

const memo = new Map<string, Promise<LandReport>>();

export function landReport(loc: LocationData): Promise<LandReport> {
  let p = memo.get(loc.key);
  if (!p) {
    p = build(loc).catch((e) => {
      memo.delete(loc.key);
      throw e;
    });
    memo.set(loc.key, p);
    if (memo.size > 100) memo.delete(memo.keys().next().value!);
  }
  return p;
}

/** The small part of the land report the advice engine needs. */
export async function landSummary(loc: LocationData): Promise<{ crosscheck: { biasPct: number } | null }> {
  const r = await landReport(loc);
  return { crosscheck: r.crosscheck && r.crosscheck.biasPct !== null ? { biasPct: r.crosscheck.biasPct } : null };
}
