import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FieldIllustration } from "@/components/home/FieldIllustration";
import { ButtonLink, Container, Eyebrow, Skeleton } from "@/components/ui/primitives";
import { districtName, fmtDate, fmtNum, getDict, isLang, money, type Lang } from "@/lib/i18n";
import { getStats } from "@/lib/server/community";
import { getKnowledge } from "@/lib/server/data";
import { getForecast } from "@/lib/server/forecast";
import { landReport } from "@/lib/server/land";
import { resolveLocation } from "@/lib/server/location";
import { marketSummary } from "@/lib/server/market";

async function LiveStrip({ lang }: { lang: Lang }) {
  await connection();
  const d = getDict(lang);
  const K = await getKnowledge();
  const [forecasts, market, stats] = await Promise.all([
    Promise.all(K.regions.map((r) => getForecast(r.lat, r.lon))),
    marketSummary().catch(() => null),
    getStats().catch(() => null),
  ]);
  const wheat = market?.crops.wheat;
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border hairline bg-beige-300/50 sm:grid-cols-[2fr_1fr_1fr]">
      <div className="bg-paper p-4">
        <p className="text-[0.8rem] font-medium text-ink-500">{d.home.liveForecast}</p>
        <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
          {K.regions.map((r, i) => {
            const day = forecasts[i]?.days[0];
            const rain = forecasts[i]?.days.reduce((a, x) => a + x.rain, 0) ?? null;
            return (
              <li key={r.id} className="min-w-0">
                <div className="truncate text-[0.78rem] text-ink-600">{districtName(lang, r.id)}</div>
                <div className="tnum text-[0.95rem] font-medium text-ink-900">{day ? `${fmtNum(lang, day.tmax)}° / ${fmtNum(lang, day.tmin)}°` : "—"}</div>
                <div className="tnum text-[0.72rem] text-water-700">{rain === null ? "" : `${fmtNum(lang, rain)} ${d.common.mm}`}</div>
              </li>
            );
          })}
        </ul>
      </div>
      <Link href={`/${lang}/market`} className="bg-paper p-4 transition hover:bg-beige-100">
        <p className="text-[0.8rem] font-medium text-ink-500">{d.home.liveWheat}</p>
        <p className="tnum mt-1 font-display text-2xl text-ink-900">{wheat ? money(lang, (wheat.median * 40) / 100) : "—"}</p>
        <p className="text-[0.78rem] text-ink-500">{d.home.perMaund}{market?.date ? ` · ${fmtDate(lang, market.date)}` : ""}</p>
      </Link>
      <div className="bg-paper p-4">
        <p className="text-[0.8rem] font-medium text-ink-500">{d.home.liveRuns}</p>
        <p className="tnum mt-1 font-display text-2xl text-ink-900">{stats && stats.advice7d > 0 ? fmtNum(lang, stats.advice7d) : "—"}</p>
        <p className="text-[0.78rem] text-ink-500">{stats && stats.advice7d > 0 ? "" : d.home.liveRunsNone}</p>
      </div>
    </div>
  );
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  const H = d.home;
  const fsd = await landReport(await resolveLocation({ region: "faisalabad" }));
  const ndvi = fsd.ndvi?.latest;
  const m = ndvi ? Number(ndvi.date.slice(5, 7)) - 1 : 0;
  return (
    <>
      {/* ------------------------------------------------ hero */}
      <section className="overflow-hidden border-b hairline">
        <Container className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="animate-rise">
            <Eyebrow>{H.eyebrow}</Eyebrow>
            <h1 className="mt-4 font-display text-[2.6rem] leading-[1.02] text-forest-900 sm:text-6xl lg:text-[4.1rem]">{H.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">{H.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={`/${lang}/advisor`}>{H.ctaPrimary}<span aria-hidden="true" className="rtl:rotate-180">→</span></ButtonLink>
              <ButtonLink href={`/${lang}/land/faisalabad`} variant="secondary">{H.ctaSecondary}</ButtonLink>
            </div>
          </div>
          <FieldIllustration
            ndvi={ndvi ? fmtNum(lang, ndvi.ndvi, 2) : "—"} ndviLabel={`${d.land.kpis.ndvi} · ${districtName(lang, "faisalabad")}${ndvi ? ` · ${fmtDate(lang, ndvi.date, { year: false })}` : ""}`}
            rain={`${fmtNum(lang, fsd.clim[m]?.rain ?? null)} ${d.common.mm}`} rainLabel={`${d.months[m]} · ${d.land.lgRain}`} />
        </Container>
        <Container className="pb-10">
          <p className="mb-2 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-harvest-700 rtl:normal-case rtl:tracking-normal">{H.liveTitle}</p>
          <Suspense fallback={<Skeleton className="h-28 w-full" />}>
            <LiveStrip lang={lang} />
          </Suspense>
        </Container>
      </section>

      {/* ------------------------------------------------ problem */}
      <section>
        <Container className="py-16">
          <h2 className="max-w-xl font-display text-3xl text-forest-900 sm:text-4xl">{H.problemTitle}</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {H.problems.map(([title, body], i) => (
              <div key={title} className="border-t-2 pt-5" style={{ borderColor: ["#3e6e7e", "#a24e2d", "#86613f"][i] }}>
                <h3 className="font-display text-xl text-ink-900">{title}</h3>
                <p className="mt-2 leading-relaxed text-ink-600">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ how it works */}
      <section className="border-y hairline bg-beige-100/70">
        <Container className="py-16">
          <h2 className="font-display text-3xl text-forest-900 sm:text-4xl">{H.howTitle}</h2>
          <ol className="relative mt-10 grid gap-10 md:grid-cols-4 md:gap-6">
            <span className="absolute inset-x-0 top-5 hidden h-px bg-soil-300/60 md:block" aria-hidden="true" />
            {H.how.map(([title, body], i) => (
              <li key={title} className="relative">
                <span className="tnum relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-forest-900 font-display text-lg text-harvest-400">{fmtNum(lang, i + 1)}</span>
                <h3 className="mt-4 font-display text-lg text-ink-900">{title}</h3>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-600">{body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ------------------------------------------------ data + ML */}
      <section>
        <Container className="grid gap-12 py-16 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="font-display text-3xl text-forest-900 sm:text-4xl">{H.dataTitle}</h2>
            <dl className="mt-6 divide-y hairline border-y hairline">
              {H.data.map(([name, body]) => (
                <div key={name} className="grid gap-1 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                  <dt className="font-medium text-soil-800">{name}</dt>
                  <dd className="text-[0.95rem] text-ink-600">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl bg-forest-900 p-6 text-cream">
              <p className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-harvest-400 rtl:normal-case rtl:tracking-normal">{d.mlTag}</p>
              <h3 className="mt-2 font-display text-2xl">{H.mlTitle}</h3>
              <p className="mt-3 leading-relaxed text-beige-200">{H.mlBody}</p>
              <Link href={`/${lang}/land/faisalabad#outlook`} className="mt-4 inline-block text-sm font-medium text-harvest-400 underline-offset-4 hover:underline">{d.common.learnMore}</Link>
            </div>
            <div className="card p-6">
              <h3 className="font-display text-xl text-forest-900">{H.trustTitle}</h3>
              <ul className="mt-3 space-y-2.5">
                {H.trust.map((x) => (
                  <li key={x} className="flex gap-2.5 text-[0.95rem] text-ink-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-harvest-500" />{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ CTA band */}
      <section className="field-rows border-y hairline bg-beige-200/60">
        <Container className="flex flex-col items-start justify-between gap-5 py-12 sm:flex-row sm:items-center">
          <p className="font-display text-2xl text-forest-900 sm:text-3xl">{H.ctaBand}</p>
          <ButtonLink href={`/${lang}/advisor`}>{H.ctaPrimary}</ButtonLink>
        </Container>
      </section>
    </>
  );
}
