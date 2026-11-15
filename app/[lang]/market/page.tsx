import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CROP_COLOR } from "@/components/charts/CropCalendar";
import { Container, OriginBadge, PageHead, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { commodityName, cropName, fmtDate, fmtNum, getDict, isLang, money, placeName, t, type Lang } from "@/lib/i18n";
import { marketSummary, type MarketSummary } from "@/lib/server/market";

export async function generateMetadata({ params }: PageProps<"/[lang]/market">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: getDict(lang).market.title, description: getDict(lang).market.lead } : {};
}

const ORDER = ["wheat", "rice", "maize", "mungbean", "cotton"];
const maund = (per100: number) => (per100 * 40) / 100;

function History({ lang, m }: { lang: Lang; m: MarketSummary }) {
  const d = getDict(lang);
  const dates = [...new Set(m.history.map((h) => h.date))].sort();
  if (dates.length < 2) return <p className="text-[0.92rem] text-ink-500">{d.market.historyNote}</p>;
  const W = 640, H = 240, P = { l: 56, r: 12, t: 12, b: 28 };
  const crops = ORDER.filter((c) => m.history.some((h) => h.crop === c));
  const vals = m.history.map((h) => maund(h.median));
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05;
  const X = (i: number) => P.l + (i / (dates.length - 1)) * (W - P.l - P.r);
  const Y = (v: number) => H - P.b - ((v - lo) / (hi - lo)) * (H - P.t - P.b);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ direction: "ltr" }} role="img" aria-label={d.market.history}>
        {[lo, (lo + hi) / 2, hi].map((g) => (
          <g key={g}><line x1={P.l} x2={W - P.r} y1={Y(g)} y2={Y(g)} stroke="#e8dec8" /><text x={P.l - 6} y={Y(g) + 4} textAnchor="end" className="tnum fill-ink-500 text-[10px]">{fmtNum(lang, g)}</text></g>
        ))}
        {crops.map((c) => {
          const pts = dates.map((dt, i) => {
            const h = m.history.find((x) => x.crop === c && x.date === dt);
            return h ? `${X(i)},${Y(maund(h.median))}` : null;
          }).filter(Boolean);
          return <polyline key={c} points={pts.join(" ")} fill="none" stroke={CROP_COLOR[c]} strokeWidth="2.2" />;
        })}
        <text x={P.l} y={H - 8} className="fill-ink-500 text-[10px]">{fmtDate(lang, dates[0])}</text>
        <text x={W - P.r} y={H - 8} textAnchor="end" className="fill-ink-500 text-[10px]">{fmtDate(lang, dates.at(-1)!)}</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-[0.82rem] text-ink-600">
        {crops.map((c) => <span key={c} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CROP_COLOR[c] }} />{cropName(lang, c)}</span>)}
      </figcaption>
    </figure>
  );
}

async function MarketContent({ lang }: { lang: Lang }) {
  await connection();
  const d = getDict(lang);
  const M = d.market;
  let m: MarketSummary;
  try {
    m = await marketSummary();
  } catch {
    return <p className="card p-6 text-clay-700">{d.errors.database_not_configured}</p>;
  }
  if (!m.date) return <p className="card p-6 text-ink-500">{M.empty}</p>;
  const crops = ORDER.filter((c) => m.crops[c]);
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center gap-3 text-[0.9rem] text-ink-600">
        <OriginBadge kind="observed" label={d.src.amis} />
        <span>{t(M.asOf, { date: fmtDate(lang, m.date), n: fmtNum(lang, m.markets) })}</span>
        <span>· {t(M.snapshots, { n: fmtNum(lang, m.snapshots) })}</span>
        {m.lastFetched && <span>· {t(M.lastFetch, { t: fmtDate(lang, m.lastFetched.slice(0, 10)) })}</span>}
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {crops.map((c) => {
          const x = m.crops[c];
          return (
            <div key={c} className="card overflow-hidden">
              <div className="h-1.5" style={{ background: CROP_COLOR[c] }} />
              <div className="p-4">
                <h2 className="font-display text-xl text-forest-900">{cropName(lang, c)}</h2>
                <p className="text-[0.75rem] text-ink-400">{commodityName(lang, x.commodity)}</p>
                <p className="tnum mt-3 font-display text-[1.7rem] leading-none text-ink-900">{money(lang, maund(x.median))}</p>
                <p className="text-[0.8rem] text-ink-500">{M.perMaund} · {M.median}</p>
                <p className="tnum mt-2 text-[0.85rem] text-ink-600">{money(lang, x.median)} <span className="text-ink-400">{M.per100}</span></p>
                <p className="tnum text-[0.8rem] text-ink-500">{M.range}: {fmtNum(lang, maund(x.min))}–{fmtNum(lang, maund(x.max))}</p>
              </div>
            </div>
          );
        })}
      </section>
      <section>
        <SectionTitle aside={<span className="text-[0.85rem] text-ink-500">{M.historyNote}</span>}>{M.history}</SectionTitle>
        <div className="card p-5"><History lang={lang} m={m} /></div>
      </section>
      <section>
        <SectionTitle>{M.markets}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {crops.map((c) => {
            const x = m.crops[c];
            const top = Math.max(...x.markets.map((r) => r.price));
            return (
              <details key={c} className="card group p-4" open={c === "wheat"}>
                <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg text-forest-900">
                  {cropName(lang, c)} <span className="text-sm text-ink-500">{fmtNum(lang, x.n)} {M.market}</span>
                </summary>
                <table className="mt-3 w-full text-[0.88rem]">
                  <thead><tr className="text-ink-500"><th className="py-1 text-start font-medium">{M.market}</th><th className="py-1 text-end font-medium">{M.perMaund}</th><th className="w-1/3" /></tr></thead>
                  <tbody>
                    {x.markets.map((r) => (
                      <tr key={r.market} className="border-t hairline">
                        <td className="py-1.5">{placeName(lang, r.market)}</td>
                        <td className="tnum py-1.5 text-end">{money(lang, maund(r.price))}</td>
                        <td className="ps-3"><div className="h-1.5 rounded-full" style={{ width: `${(r.price / top) * 100}%`, background: CROP_COLOR[c] }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {x.varieties.length > 0 && (
                  <div className="mt-3 border-t hairline pt-3">
                    <p className="mb-1 text-[0.82rem] font-medium text-ink-600">{M.varieties}</p>
                    <ul className="space-y-0.5 text-[0.82rem] text-ink-600">
                      {x.varieties.map((v) => <li key={v.commodity} className="flex justify-between gap-3"><span>{commodityName(lang, v.commodity)}</span><span className="tnum">{money(lang, maund(v.median))}</span></li>)}
                    </ul>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </section>
      <p className="text-[0.85rem] text-ink-500">{M.wholesale} · <a href="http://www.amis.pk" className="underline" rel="noopener noreferrer" target="_blank">amis.pk</a></p>
    </div>
  );
}

export default async function MarketPage({ params }: PageProps<"/[lang]/market">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  return (
    <>
      <PageHead eyebrow={d.src.amis} title={d.market.title} lead={d.market.lead} />
      <Container className="py-10">
        <Suspense fallback={<div className="grid gap-4 sm:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44" />)}</div>}>
          <MarketContent lang={lang} />
        </Suspense>
      </Container>
    </>
  );
}
