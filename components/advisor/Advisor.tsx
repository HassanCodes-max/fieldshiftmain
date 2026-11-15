"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Choice, Toggle } from "@/components/ui/Choice";
import { Skeleton } from "@/components/ui/primitives";
import { cropName, districtName, fmtNum, getDict, rotationName, t, type Lang } from "@/lib/i18n";
import type { AdviceResult } from "@/lib/server/advice";
import { Results } from "./Results";
import {
  AVAIL, CROPS, decode, encode, IRR, PRIORITIES, REGIONS, SAL, SCENARIOS, STANDARD, TEX, toAdviceInput, type AdvisorState,
} from "./state";

const PickMap = dynamic(() => import("@/components/map/PickMap"), { ssr: false, loading: () => <Skeleton className="h-[420px] w-full" /> });
const REGION_COORDS: Record<string, [number, number]> = {
  faisalabad: [31.3, 73.25], sheikhupura: [31.65, 73.8], gujranwala: [32.1, 73.95], hafizabad: [32.0, 73.6], okara: [30.7, 73.35], multan: [30.1, 71.6],
};

function Q({ n, title, children }: { n: string; title: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="card p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-3.5 flex items-center gap-3">
        <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-beige-200 text-sm font-semibold text-soil-800">{n}</span>
        <h2 className="font-display text-[1.15rem] text-forest-900">{title}</h2>
      </div>
      {children}
    </fieldset>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mb-2 mt-4 text-[0.88rem] font-medium text-ink-600">{children}</p>;
}

function RotationBuilder({ lang, onUse, useLabel }: { lang: Lang; onUse: (crops: string[]) => void; useLabel: string }) {
  const d = getDict(lang);
  const [seq, setSeq] = useState<string[]>([]);
  return (
    <div className="rounded-xl border border-dashed border-soil-300 bg-beige-100/50 p-3.5">
      <p className="text-[0.85rem] text-ink-600">{d.advisor.buildHint}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {CROPS.map((c) => {
          const at = seq.indexOf(c);
          return (
            <button key={c} type="button" disabled={at < 0 && seq.length >= 4} onClick={() => setSeq((s) => (at >= 0 ? s.filter((x) => x !== c) : [...s, c]))}
              aria-pressed={at >= 0}
              className={`min-h-10 rounded-full border px-3.5 text-sm transition ${at >= 0 ? "border-harvest-600 bg-harvest-100 text-harvest-800" : "border-soil-200 bg-paper text-ink-700 hover:border-soil-500"} disabled:opacity-40`}>
              {at >= 0 && <span className="tnum me-1.5 font-semibold">{fmtNum(lang, at + 1)}</span>}{cropName(lang, c)}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="min-h-6 text-[0.9rem] font-medium text-ink-800">{seq.length ? rotationName(lang, seq) : ""}</span>
        <span className="ms-auto flex gap-2">
          {seq.length > 0 && <button type="button" onClick={() => setSeq([])} className="rounded-full px-3 py-1.5 text-sm text-ink-500 hover:bg-beige-200">{d.advisor.buildClear}</button>}
          <button type="button" disabled={seq.length < 2} onClick={() => { onUse(seq); setSeq([]); }}
            className="rounded-full bg-soil-800 px-4 py-1.5 text-sm font-medium text-cream disabled:opacity-40">{useLabel}</button>
        </span>
      </div>
    </div>
  );
}

export function Advisor({ lang }: { lang: Lang }) {
  const d = getDict(lang);
  const A = d.advisor;
  const sp = useSearchParams();
  const [s, setS] = useState<AdvisorState>(() => decode(new URLSearchParams(sp.toString())));
  const [result, setResult] = useState<AdviceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingNasa, setFetchingNasa] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [draftPoint, setDraftPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [showAllTextures, setShowAllTextures] = useState(() => !["sandy loam", "loam", "clay loam"].includes(decode(new URLSearchParams(sp.toString())).texture));
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const update = useCallback((patch: Partial<AdvisorState>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setSaved(null); // a saved link no longer matches changed answers
  }, []);
  const body = useMemo(() => toAdviceInput(s, lang), [s, lang]);

  // keep the URL in sync (shareable, no page reload)
  useEffect(() => {
    window.history.replaceState(null, "", `?${encode(s)}`);
  }, [s]);

  // recompute on the server whenever an answer changes (debounced, stale requests cancelled)
  useEffect(() => {
    const ctl = new AbortController();
    abort.current?.abort();
    abort.current = ctl;
    const custom = "lat" in s.location;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      const slow = custom ? setTimeout(() => setFetchingNasa(true), 700) : undefined;
      try {
        const r = await fetch("/api/advice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "internal_error");
        setResult(j as AdviceResult);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const code = e instanceof TypeError ? "network" : (e as Error).message;
        setError((d.errors as Record<string, string>)[code] ?? d.errors.internal_error);
      } finally {
        clearTimeout(slow);
        if (!ctl.signal.aborted) {
          setBusy(false);
          setFetchingNasa(false);
        }
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [body, d, s.location]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advice: body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSaved(`${window.location.origin}/${lang}/plan/${j.id}`);
    } catch (e) {
      setSaveError((d.errors as Record<string, string>)[(e as Error).message] ?? d.errors.internal_error);
    } finally {
      setSaving(false);
    }
  }

  function gps() {
    setGpsMsg(null);
    if (!navigator.geolocation) return setGpsMsg(A.gpsFail);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 100) / 100;
        const lon = Math.round(p.coords.longitude * 100) / 100;
        if (lat < 23.5 || lat > 37.2 || lon < 60.8 || lon > 77.9) return setGpsMsg(A.outside);
        update({ location: { lat, lon } });
      },
      () => setGpsMsg(A.gpsFail),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  const currentKey = s.current.join("-");
  const standardKey = Object.entries(STANDARD).find(([, v]) => v.join("-") === currentKey)?.[0] ?? null;
  const textures = showAllTextures ? TEX : (["sandy loam", "loam", "clay loam"] as const);
  const best = result?.rotations[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
      {/* ======================================================== questions */}
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label={A.title}>
        <Q n={fmtNum(lang, 1)} title={A.q.location}>
          <Choice label={A.q.location} value={"region" in s.location ? s.location.region : null} onChange={(r) => update({ location: { region: r } })}
            options={REGIONS.map((r) => ({ value: r, label: districtName(lang, r) }))} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setDraftPoint("lat" in s.location ? s.location : null); setMapOpen(true); }}
              className={`min-h-11 rounded-xl border px-3.5 text-[0.92rem] transition ${"lat" in s.location ? "border-forest-900 bg-forest-900 text-cream" : "border-soil-300 bg-paper text-soil-900 hover:bg-beige-100"}`}>
              {"lat" in s.location ? `${A.customPlace}: ${fmtNum(lang, s.location.lat, 2)}°, ${fmtNum(lang, s.location.lon, 2)}°` : A.pickMap}
            </button>
            <button type="button" onClick={gps} className="min-h-11 rounded-xl px-3 text-[0.92rem] text-forest-700 hover:bg-beige-200/70">{A.useGps}</button>
            {gpsMsg && <span className="text-sm text-clay-700">{gpsMsg}</span>}
          </div>
        </Q>

        <Q n={fmtNum(lang, 2)} title={A.q.rotation}>
          <Choice label={A.q.rotation} columns value={standardKey} onChange={(k) => update({ current: STANDARD[k] })}
            options={Object.entries(STANDARD).map(([k, v]) => ({ value: k, label: rotationName(lang, v) }))} />
          {!standardKey && <p className="mt-3 rounded-xl bg-harvest-100 px-3.5 py-2.5 text-[0.92rem] text-harvest-800">{A.yourRotation}: <b>{rotationName(lang, s.current)}</b></p>}
          <button type="button" onClick={() => setBuilding((v) => !v)} className="mt-3 text-sm font-medium text-forest-700 underline-offset-4 hover:underline">{A.buildOwn}</button>
          {building && <div className="mt-3"><RotationBuilder lang={lang} useLabel={A.buildUse} onUse={(c) => { update({ current: c }); setBuilding(false); }} /></div>}
        </Q>

        <Q n={fmtNum(lang, 3)} title={A.q.water}>
          <Choice label={A.q.water} value={s.irrigation} onChange={(v) => update({ irrigation: v })} options={IRR.map((v) => ({ value: v, label: (d.irrigation as Record<string, string>)[v] }))} />
          <Sub>{A.q.enough}</Sub>
          <Choice label={A.q.enough} value={s.availability} onChange={(v) => update({ availability: v })} options={AVAIL.map((v) => ({ value: v, label: (d.availability as Record<string, string>)[v] }))} />
        </Q>

        <Q n={fmtNum(lang, 4)} title={A.q.soil}>
          <Choice label={A.q.soil} value={s.texture} onChange={(v) => update({ texture: v })}
            options={textures.map((v) => ({ value: v, label: showAllTextures ? (d.textures as Record<string, string>)[v] : (d.texturesSimple as Record<string, string>)[v] }))} />
          <button type="button" className="mt-2 text-sm text-forest-700 underline-offset-4 hover:underline" onClick={() => setShowAllTextures((v) => !v)}>{showAllTextures ? d.common.less : d.common.more}</button>
          <Sub>{A.q.salt}</Sub>
          <Choice label={A.q.salt} value={s.salinity} onChange={(v) => update({ salinity: v })} options={SAL.map((v) => ({ value: v, label: (d.salinity as Record<string, string>)[v] }))} />
          <Sub>{A.q.wet}</Sub>
          <Toggle label={A.q.wet} value={s.waterlogging} onChange={(v) => update({ waterlogging: v })} yes={d.common.yes} no={d.common.no} />
          <Sub>{A.q.burn}</Sub>
          <Toggle label={A.q.burn} value={s.burns} onChange={(v) => update({ burns: v })} yes={d.common.yes} no={d.common.no} />
        </Q>

        <Q n={fmtNum(lang, 5)} title={A.q.priority}>
          <Choice label={A.q.priority} value={s.priority} onChange={(v) => update({ priority: v, weights: { ...PRIORITIES[v] } })}
            options={Object.keys(PRIORITIES).map((k) => ({ value: k, label: (d.priorities as Record<string, string>)[k] }))} />
        </Q>

        <details className="card group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-display text-[1.1rem] text-forest-900">
            {A.advanced}
            <svg viewBox="0 0 20 20" className="h-5 w-5 text-soil-500 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 8l5 5 5-5" /></svg>
          </summary>
          <div className="mt-4 space-y-5">
            <div>
              <h3 className="mb-2 text-[0.95rem] font-semibold text-ink-700">{A.q.market}</h3>
              <div className="space-y-2.5">
                {CROPS.map((c) => (
                  <div key={c} className="grid items-center gap-2 sm:grid-cols-[6rem_1fr]">
                    <span className="text-[0.92rem] text-ink-700">{cropName(lang, c)}</span>
                    <Choice label={cropName(lang, c)} value={s.market[c] ?? "Unknown"} onChange={(v) => update({ market: { ...s.market, [c]: v } })}
                      options={(["Yes", "Unknown", "No"] as const).map((v) => ({ value: v, label: (d.marketAnswers as Record<string, string>)[v] }))} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[0.95rem] font-semibold text-ink-700">{A.q.weights}</h3>
              <p className="mb-2 text-[0.82rem] text-ink-500">{A.weightHint}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(s.weights) as (keyof AdvisorState["weights"])[]).map((f) => (
                  <label key={f} className="block">
                    <span className="flex justify-between text-[0.88rem] text-ink-700"><span>{(d.factors as Record<string, string>)[f]}</span><b className="tnum">{fmtNum(lang, s.weights[f])}</b></span>
                    <input type="range" min={0} max={10} step={1} value={s.weights[f]} className="mt-1 w-full accent-forest-700"
                      onChange={(e) => update({ priority: "custom", weights: { ...s.weights, [f]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-[0.95rem] font-semibold text-ink-700">{A.q.scenario}</h3>
              <Choice label={A.q.scenario} value={s.scenario} onChange={(v) => update({ scenario: v })} options={Object.keys(SCENARIOS).map((k) => ({ value: k, label: (d.scenarios as Record<string, string>)[k] }))} />
            </div>
            <div>
              <h3 className="mb-2 text-[0.95rem] font-semibold text-ink-700">{A.compareMore}</h3>
              {s.extra.length > 0 && (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {s.extra.map((r, i) => (
                    <li key={r.join("-")} className="flex items-center gap-1 rounded-full bg-beige-200 py-1 pe-1 ps-3 text-sm">
                      {rotationName(lang, r)}
                      <button type="button" aria-label={A.removeRot} onClick={() => update({ extra: s.extra.filter((_, j) => j !== i) })} className="rounded-full px-2 text-ink-500 hover:bg-beige-300">×</button>
                    </li>
                  ))}
                </ul>
              )}
              {s.extra.length < 4 && <RotationBuilder lang={lang} useLabel={A.buildCompare} onUse={(c) => update({ extra: [...s.extra.filter((x) => x.join() !== c.join()), c].slice(0, 4) })} />}
            </div>
          </div>
        </details>
      </form>

      {/* ======================================================== results */}
      <div ref={resultsRef} className="scroll-mt-20 lg:sticky lg:top-20">
        {error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-clay-600/30 bg-clay-100 px-4 py-3 text-[0.92rem] text-clay-800">
            {error}
            <button type="button" className="rounded-full bg-paper px-3 py-1 text-sm" onClick={() => setS((p) => ({ ...p }))}>{d.common.retry}</button>
          </div>
        )}
        {fetchingNasa && <p className="mb-3 animate-fade rounded-xl bg-water-100 px-4 py-3 text-[0.9rem] text-water-800">{A.fetchingNasa}</p>}
        {result ? (
          <Results lang={lang} result={result} busy={busy} onSave={save} saved={saved} saving={saving} saveError={saveError} />
        ) : (
          <div className="space-y-4" aria-busy="true" aria-label={A.computing}>
            <Skeleton className="h-48" />
            <Skeleton className="h-72" />
          </div>
        )}
      </div>

      {/* mobile summary bar */}
      {best && (
        <button type="button" onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl bg-forest-900 px-4 py-3 text-start text-cream shadow-lg lg:hidden no-print">
          <span className="min-w-0 truncate text-[0.92rem]">{rotationName(lang, best.crops)}</span>
          <span className="flex shrink-0 items-center gap-2"><b className="tnum font-display text-xl">{fmtNum(lang, best.total)}</b><span className="text-sm text-harvest-400">{A.mobileSee}</span></span>
        </button>
      )}

      {/* map dialog */}
      {mapOpen && (
        <div role="dialog" aria-modal="true" aria-label={A.mapTitle} className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-6" onClick={() => setMapOpen(false)}>
          <div className="w-full max-w-3xl animate-rise rounded-t-2xl bg-paper p-4 sm:rounded-2xl sm:p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl text-forest-900">{A.mapTitle}</h2>
              <button type="button" onClick={() => setMapOpen(false)} className="rounded-full px-3 py-1 text-sm text-ink-500 hover:bg-beige-200">{d.common.close}</button>
            </div>
            <p className="mb-3 text-[0.9rem] text-ink-600">{A.mapHint}</p>
            <PickMap value={draftPoint} onPick={(lat, lon) => setDraftPoint({ lat, lon })}
              points={REGIONS.map((r) => ({ id: r, lat: REGION_COORDS[r][0], lon: REGION_COORDS[r][1], label: districtName(lang, r) }))}
              onPointClick={(id) => { update({ location: { region: id } }); setMapOpen(false); }} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="tnum text-sm text-ink-600">{draftPoint ? `${fmtNum(lang, draftPoint.lat, 2)}°, ${fmtNum(lang, draftPoint.lon, 2)}°` : ""}</span>
              <button type="button" disabled={!draftPoint} onClick={() => { if (draftPoint) update({ location: draftPoint }); setMapOpen(false); }}
                className="min-h-11 rounded-full bg-forest-900 px-5 font-medium text-cream disabled:opacity-40">{A.mapUse}</button>
            </div>
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{busy ? A.computing : best ? t(A.resultFor, { place: "" }) : ""}</span>
    </div>
  );
}
