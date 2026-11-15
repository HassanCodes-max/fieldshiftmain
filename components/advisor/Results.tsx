"use client";

import { useState } from "react";
import { CropCalendar } from "@/components/charts/CropCalendar";
import { Level } from "@/components/ui/primitives";
import { factText } from "@/lib/i18n/facts";
import { fmtInt, fmtNum, getDict, rotationName, t, type Lang } from "@/lib/i18n";
import type { AdviceResult, AdviceRotation } from "@/lib/server/advice";
import type { Fact } from "@/lib/engine/types";

const FACTORS = ["water", "soil", "climate", "soilfit", "calendar", "market"] as const;

export function ScoreRing({ value, label, display }: { value: number; label: string; display?: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={`${Math.round(value)}/100`}>
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
        <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(255,252,245,.16)" strokeWidth="9" />
        {/* CSS-only animation: always ends filled, even if JavaScript animation frames are throttled */}
        <circle cx="52" cy="52" r={r} fill="none" stroke="#d9ae4f" strokeWidth="9" strokeLinecap="round" strokeDasharray={c}
          className="ring-fill" strokeDashoffset={c * (1 - v / 100)} style={{ ["--full" as string]: String(c), transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-cream">
        <span className="tnum font-display text-[2rem] leading-none">{display ?? Math.round(value)}</span>
        <span className="mt-1 text-[0.7rem] text-beige-200">{label}</span>
      </div>
    </div>
  );
}

function Bar({ value, tone = "forest" }: { value: number; tone?: "forest" | "clay" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-beige-200">
      <div className={`h-full rounded-full transition-[width] duration-700 ${tone === "clay" ? "bg-clay-600" : "bg-forest-600"}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

function FactList({ facts, lang, empty, limit = 6 }: { facts: Fact[]; lang: Lang; empty: string; limit?: number }) {
  const [all, setAll] = useState(false);
  const list = facts.length ? facts : [];
  const d = getDict(lang);
  if (!list.length) return <p className="text-[0.95rem] text-ink-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {(all ? list : list.slice(0, limit)).map((f, i) => (
        <li key={i} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink-700">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-soil-300" />
          <span>{factText(f, lang)}</span>
        </li>
      ))}
      {list.length > limit && (
        <li>
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm font-medium text-forest-700 underline-offset-4 hover:underline">
            {all ? d.common.less : `${d.common.more} (+${fmtNum(lang, list.length - limit)})`}
          </button>
        </li>
      )}
    </ul>
  );
}

export function Results({ lang, result, busy, onSave, saved, saving, saveError }: {
  lang: Lang; result: AdviceResult; busy: boolean; onSave: () => void; saved: string | null; saving: boolean; saveError: string | null;
}) {
  const d = getDict(lang);
  const A = d.advisor;
  const [tab, setTab] = useState<"overview" | "compare" | "soil" | "evidence">("overview");
  const [copied, setCopied] = useState(false);
  const best = result.rotations[0];
  const cur = result.rotations.find((r) => r.isCurrent)!;
  const isSame = best.id === cur.id;
  const name = (r: AdviceRotation) => rotationName(lang, r.crops);
  const place = result.location.region ? (d.districts as Record<string, string>)[result.location.region] : `${fmtNum(lang, result.location.lat, 2)}°, ${fmtNum(lang, result.location.lon, 2)}°`;
  const waterPct = !isSame && best.water !== null && cur.water ? (100 * (best.water - cur.water)) / cur.water : null;
  const scenarioActive = result.scenario.temp !== 0 || result.scenario.rainPct !== 0;
  const scenarioName = result.scenario.temp && result.scenario.rainPct ? d.scenarios.both : result.scenario.temp ? d.scenarios.warm : d.scenarios.dry;
  const shareText = `${t(A.resultFor, { place })}: ${name(best)} (${fmtNum(lang, best.total)}/100).`;

  return (
    <div className={`space-y-4 transition-opacity ${busy ? "opacity-70" : ""}`} aria-busy={busy}>
      {/* ------------------------------------------------ verdict */}
      <section className="relative overflow-hidden rounded-2xl bg-forest-900 p-5 text-cream sm:p-6" aria-live="polite">
        <svg className="pointer-events-none absolute -bottom-6 end-0 h-32 w-64 opacity-[0.13]" viewBox="0 0 200 100" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${i * 34 - 20} 100 L${100 + (i - 3) * 6} 12`} stroke="#d9ae4f" strokeWidth="2" />)}
        </svg>
        <div className="relative flex items-center gap-5">
          <ScoreRing value={best.total} label={A.match} display={fmtNum(lang, best.total)} />
          <div className="min-w-0">
            <p className="text-sm text-beige-200">{t(A.resultFor, { place })}</p>
            <h2 className="mt-1 font-display text-[1.55rem] leading-tight sm:text-[1.8rem]">{t(isSame ? A.keep : A.switch, { name: name(best) })}</h2>
            <p className="mt-1.5 text-[0.95rem] text-beige-200">
              {isSame ? A.keepSub : t(A.switchSub, { current: name(cur), score: fmtNum(lang, best.total), cscore: fmtNum(lang, cur.total) })}
            </p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2 text-[0.85rem]">
          {waterPct !== null && (
            <span className="rounded-full bg-cream/10 px-3 py-1">{Math.abs(waterPct) < 5 ? A.waterSame : t(waterPct < 0 ? A.waterLess : A.waterMore, { pct: fmtNum(lang, Math.abs(waterPct)) })}</span>
          )}
          {best.irrigations !== null && <span className="rounded-full bg-cream/10 px-3 py-1">{t(A.irrigationsYear, { n: fmtNum(lang, best.irrigations) })}</span>}
          <span className="rounded-full bg-cream/10 px-3 py-1">{(d.confidence as Record<string, string>)[best.confidence]}</span>
        </div>
        {scenarioActive && <p className="relative mt-3 rounded-lg bg-harvest-500/20 px-3 py-2 text-[0.85rem] text-harvest-100">{t(A.scenarioNote, { s: scenarioName })}</p>}
      </section>

      {/* ------------------------------------------------ tabs */}
      <div className="card overflow-hidden">
        <div role="tablist" aria-label={A.title} className="flex overflow-x-auto border-b hairline bg-beige-100/60">
          {(["overview", "compare", "soil", "evidence"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={`min-h-12 flex-1 whitespace-nowrap px-4 text-[0.92rem] font-medium transition-colors ${tab === k ? "border-b-2 border-forest-900 text-forest-900" : "text-ink-500 hover:text-ink-900"}`}>
              {A.tabs[k]}
            </button>
          ))}
        </div>
        <div className="p-5 sm:p-6" role="tabpanel">
          {tab === "overview" && (
            <div className="animate-fade space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 flex items-center gap-2 font-sans text-[0.95rem] font-semibold text-olive-700"><span className="h-2 w-2 rounded-full bg-olive-500" />{A.good}</h3>
                  <FactList facts={best.benefits} lang={lang} empty={A.noGood} />
                </div>
                <div>
                  <h3 className="mb-3 flex items-center gap-2 font-sans text-[0.95rem] font-semibold text-clay-700"><span className="h-2 w-2 rounded-full bg-clay-600" />{A.watch}</h3>
                  <FactList facts={best.risks} lang={lang} empty={A.noRisk} limit={5} />
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.calendar}</h3>
                <CropCalendar lang={lang} rows={[
                  { label: isSame ? d.common.current : d.common.new, slots: best.schedule.slots, highlight: true },
                  ...(isSame ? [] : [{ label: d.common.current, slots: cur.schedule.slots }]),
                ]} />
              </div>
            </div>
          )}

          {tab === "compare" && (
            <div className="animate-fade">
              <h3 className="sr-only">{A.compareTitle}</h3>
              <div className="space-y-3">
                {result.rotations.map((r) => (
                  <div key={r.id} className={`rounded-xl border p-4 ${r.id === best.id ? "border-forest-600 bg-forest-100/40" : "hairline bg-paper"}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-medium text-ink-900">
                        <span className="me-2 text-ink-400 tnum">{fmtNum(lang, r.rank)}.</span>{name(r)}
                        {r.isCurrent && <span className="ms-2 rounded-full bg-harvest-100 px-2 py-0.5 text-[0.72rem] text-harvest-800">{d.common.current}</span>}
                        {r.gated && <span className="ms-2 rounded-full bg-clay-100 px-2 py-0.5 text-[0.72rem] text-clay-800">{A.notSuited}</span>}
                      </div>
                      <div className="tnum font-display text-xl text-forest-900">{fmtNum(lang, r.total)}<span className="text-sm text-ink-400">{d.common.of100}</span></div>
                    </div>
                    <div className="mt-2"><Bar value={r.total} tone={r.gated ? "clay" : "forest"} /></div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.82rem] sm:grid-cols-3 lg:grid-cols-6">
                      {FACTORS.map((f) => (
                        <div key={f}>
                          <dt className="truncate text-ink-500">{(d.factors as Record<string, string>)[f]}</dt>
                          <dd className="tnum flex items-center gap-2 text-ink-800"><span className="w-7">{fmtNum(lang, r.scores[f])}</span><Bar value={r.scores[f]} /></dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.82rem] text-ink-600">
                      <span>{A.compareCols.water}: <b className="tnum font-medium text-ink-900">{fmtNum(lang, r.water)} {d.common.mm}</b></span>
                      <span>{A.compareCols.irrigations}: <b className="tnum font-medium text-ink-900">{fmtNum(lang, r.irrigations)}</b></span>
                      <span>{A.compareCols.bare}: <b className="tnum font-medium text-ink-900">{fmtNum(lang, r.schedule.bareDays)}</b></span>
                      <span>{(d.confidence as Record<string, string>)[r.confidence]}</span>
                    </div>
                    {r.gated && <p className="mt-2 text-[0.82rem] text-clay-700">{A.notSuitedWhy} {r.gates.map((g) => factText(g, lang)).join(" ")}</p>}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.calendar}</h3>
                <CropCalendar lang={lang} rows={result.rotations.map((r) => ({ label: name(r), slots: r.schedule.slots, highlight: r.id === best.id }))} />
              </div>
            </div>
          )}

          {tab === "soil" && (
            <div className="animate-fade space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[0.85rem]">
                  <caption className="mb-3 text-start font-sans text-[0.95rem] font-semibold text-ink-700">{A.soilTitle}</caption>
                  <thead>
                    <tr className="border-b hairline text-start text-ink-500">
                      <th className="py-2 pe-3 text-start font-medium">{A.compareCols.rotation}</th>
                      {(["nfix", "cover", "deep", "pest", "erosion", "forage"] as const).map((k) => <th key={k} className="px-2 py-2 text-start font-medium">{A.soilCols[k]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rotations.map((r) => (
                      <tr key={r.id} className="border-b hairline last:border-0">
                        <td className="py-2.5 pe-3 font-medium text-ink-900">{name(r)}</td>
                        {[r.soilHealth.nFixing, r.soilHealth.cover, r.soilHealth.deep].map((v, i) => (
                          <td key={i} className="px-2">{v ? <span className="text-olive-700">● {d.common.yes}</span> : <span className="text-ink-400">— {d.common.no}</span>}</td>
                        ))}
                        <td className="px-2"><Level level={r.soilHealth.pest} label={(d.levels as Record<string, string>)[r.soilHealth.pest]} highIsGood /></td>
                        <td className="px-2"><Level level={r.soilHealth.erosion} label={(d.levels as Record<string, string>)[r.soilHealth.erosion]} /></td>
                        <td className="px-2"><Level level={r.soilHealth.forage} label={(d.levels as Record<string, string>)[r.soilHealth.forage]} highIsGood /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.soilGuideTitle} — {name(best)}</h3>
                  <FactList facts={best.soilHealth.roles} lang={lang} empty="" />
                </div>
                <div className="space-y-5">
                  <div>
                    <h4 className="mb-2 text-[0.9rem] font-semibold text-ink-700">{A.soilCols.pest}</h4>
                    <FactList facts={best.soilHealth.pestFacts} lang={lang} empty="" />
                  </div>
                  <div>
                    <h4 className="mb-2 text-[0.9rem] font-semibold text-ink-700">{A.soilCols.erosion}</h4>
                    <FactList facts={best.soilHealth.erosionFacts} lang={lang} empty="" />
                  </div>
                  <div>
                    <h4 className="mb-2 text-[0.9rem] font-semibold text-ink-700">{A.soilCols.forage}</h4>
                    <FactList facts={best.soilHealth.forageFacts} lang={lang} empty="" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "evidence" && (
            <div className="animate-fade space-y-7">
              <div>
                <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.evidenceTitle}</h3>
                <FactList facts={best.evidence} lang={lang} empty="—" limit={8} />
                {result.data.years && <p className="mt-3 text-[0.82rem] text-ink-500">{t(A.dataUsed, { a: fmtInt(lang, result.data.years[0]), b: fmtInt(lang, result.data.years[1]) })}</p>}
              </div>
              <div>
                <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.breakdownTitle} — {name(best)}</h3>
                <dl className="divide-y hairline rounded-xl border hairline">
                  {FACTORS.map((f) => (
                    <div key={f} className="grid gap-1 p-3 sm:grid-cols-[11rem_3rem_1fr] sm:items-baseline sm:gap-3">
                      <dt className="text-[0.9rem] font-medium text-ink-800">{(d.factors as Record<string, string>)[f]}</dt>
                      <dd className="tnum font-display text-lg text-forest-900">{fmtNum(lang, best.scores[f])}</dd>
                      <dd className="text-[0.85rem] text-ink-600">{best.notes[f].map((n) => factText(n, lang)).join(lang === "ur" ? "؛ " : "; ")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.robustTitle}</h3>
                <ul className="space-y-1.5 text-[0.92rem] text-ink-700">
                  {result.robustness.map((r) => {
                    const w = result.rotations.find((x) => x.id === r.winner);
                    return <li key={r.factor}>{t(A.robust, { factor: (d.factors as Record<string, string>)[r.factor].toLowerCase(), winner: w ? name(w) : r.winner })}</li>;
                  })}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-sans text-[0.95rem] font-semibold text-ink-700">{A.gapsTitle}</h3>
                <FactList facts={best.gaps} lang={lang} empty="—" limit={8} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ save & share */}
      <section className="card p-5 sm:p-6 no-print">
        <h3 className="font-display text-lg text-forest-900">{A.saveTitle}</h3>
        {!saved ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onSave} disabled={saving}
              className="min-h-11 rounded-full bg-forest-900 px-5 text-[0.95rem] font-medium text-cream transition hover:bg-forest-800 disabled:opacity-60">
              {saving ? A.saving : A.saveBtn}
            </button>
            <button type="button" onClick={() => window.print()} className="min-h-11 rounded-full border border-soil-300 bg-paper px-5 text-[0.95rem] text-soil-900 hover:bg-beige-100">{d.common.print}</button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-[0.92rem] text-ink-600">{A.saved}</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="ltr-nums max-w-full truncate rounded-lg bg-beige-100 px-3 py-2 text-[0.85rem]">{saved}</code>
              <button type="button" className="min-h-10 rounded-full border border-soil-300 px-4 text-sm hover:bg-beige-100"
                onClick={async () => { await navigator.clipboard.writeText(saved); setCopied(true); }}>{copied ? d.common.copied : d.common.copy}</button>
              <a className="min-h-10 rounded-full bg-[#1f7a4d] px-4 py-2 text-sm font-medium text-white hover:bg-[#19663f]" target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${saved}`)}`}>{A.whatsapp}</a>
            </div>
          </div>
        )}
        {saveError && <p className="mt-2 text-sm text-clay-700">{saveError}</p>}
        <p className="mt-4 border-t hairline pt-3 text-[0.85rem] text-ink-500">{A.officer}</p>
      </section>
    </div>
  );
}
