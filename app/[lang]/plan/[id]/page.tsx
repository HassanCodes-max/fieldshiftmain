import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { encode } from "@/components/advisor/state";
import { CropCalendar } from "@/components/charts/CropCalendar";
import { Feedback } from "@/components/plan/Feedback";
import { ButtonLink, Container, PageHead, Skeleton } from "@/components/ui/primitives";
import { districtName, fmtDate, fmtNum, getDict, isLang, rotationName, t, type Lang } from "@/lib/i18n";
import { getPlan } from "@/lib/server/community";
import { scheduleRotation } from "@/lib/engine";
import { iso } from "@/lib/engine/util";
import { getKnowledge } from "@/lib/server/data";
import { PlanIdSchema } from "@/lib/validation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function PlanContent({ params }: { params: PageProps<"/[lang]/plan/[id]">["params"] }) {
  await connection();
  const { lang: l, id } = await params;
  if (!isLang(l) || !PlanIdSchema.safeParse(id).success) notFound();
  const lang = l as Lang;
  const d = getDict(lang);
  const plan = await getPlan(id).catch(() => null);
  if (!plan) {
    return <Container className="py-16"><p className="card p-6 text-lg text-ink-600">{d.plan.notFound}</p></Container>;
  }
  const K = await getKnowledge();
  const s = plan.summary;
  const best = s.ranking[0];
  const cur = s.ranking.find((r) => r.id === s.current) ?? best;
  const place = s.location.region ? districtName(lang, s.location.region) : `${fmtNum(lang, s.location.lat, 2)}°, ${fmtNum(lang, s.location.lon, 2)}°`;
  const sched = (crops: string[]) => scheduleRotation(crops, K).slots.map((x) => ({ crop: x.crop, sow: iso(x.sow), harvest: iso(x.harvest) }));
  const a = plan.input;
  const advisorQuery = encode({
    location: a.location, current: a.current, irrigation: a.profile.irrigation, availability: a.profile.waterAvailability,
    texture: a.profile.soilTexture, salinity: a.profile.salinity, waterlogging: a.profile.waterlogging, burns: a.profile.burnsResidue,
    priority: "custom", weights: a.profile.weights, market: a.profile.market as Record<string, "Yes" | "Unknown" | "No">, scenario: "base",
    extra: (a.rotations ?? []).filter((r) => r.length && !K.rotations.some((x) => x.crops.join() === r.join())),
  });
  return (
    <>
      <PageHead eyebrow={d.plan.title} title={t(d.advisor.resultFor, { place })} lead={`${t(d.plan.created, { date: fmtDate(lang, plan.createdAt.slice(0, 10)) })} · ${t(d.plan.views, { n: fmtNum(lang, plan.views) })}`} />
      <Container className="grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-forest-900 p-6 text-cream">
            <p className="text-sm text-beige-200">{t(d.advisor.resultFor, { place })}</p>
            <h2 className="mt-1 font-display text-3xl">{t(best.id === cur.id ? d.advisor.keep : d.advisor.switch, { name: rotationName(lang, best.crops) })}</h2>
            <p className="tnum mt-2 text-beige-200">{fmtNum(lang, best.total)}{d.common.of100} · {(d.confidence as Record<string, string>)[best.confidence]}</p>
          </section>
          <section className="card p-5">
            <ol className="space-y-3">
              {s.ranking.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="tnum w-6 text-ink-400">{fmtNum(lang, i + 1)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{rotationName(lang, r.crops)}{r.id === s.current && <span className="ms-2 rounded-full bg-harvest-100 px-2 py-0.5 text-[0.72rem] text-harvest-800">{d.common.current}</span>}</span>
                  <span className="hidden w-40 sm:block"><span className="block h-1.5 rounded-full bg-beige-200"><span className={`block h-full rounded-full ${r.gated ? "bg-clay-600" : "bg-forest-600"}`} style={{ width: `${r.total}%` }} /></span></span>
                  <span className="tnum w-12 text-end font-display text-lg">{fmtNum(lang, r.total)}</span>
                  <span className="tnum hidden w-24 text-end text-sm text-ink-500 sm:block">{fmtNum(lang, r.water)} {d.common.mm}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="card p-5">
            <h3 className="mb-3 font-display text-lg text-forest-900">{d.advisor.calendar}</h3>
            <CropCalendar lang={lang} rows={[
              { label: d.common.new, slots: sched(best.crops), highlight: true },
              ...(best.id === cur.id ? [] : [{ label: d.common.current, slots: sched(cur.crops) }]),
            ]} />
          </section>
          <ButtonLink href={`/${lang}/advisor?${advisorQuery}`} variant="secondary">{d.plan.open}</ButtonLink>
          <p className="text-[0.85rem] text-ink-500">{d.advisor.officer}</p>
        </div>
        <div>
          <Feedback lang={lang} planId={plan.id} region={s.location.region ?? undefined} />
        </div>
      </Container>
    </>
  );
}

export default function PlanPage({ params }: PageProps<"/[lang]/plan/[id]">) {
  return (
    <Suspense fallback={<Container className="space-y-6 py-12"><Skeleton className="h-24" /><Skeleton className="h-64" /></Container>}>
      <PlanContent params={params} />
    </Suspense>
  );
}
