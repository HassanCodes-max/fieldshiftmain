import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandPicker } from "@/components/land/LandPicker";
import { Container, PageHead, SectionTitle } from "@/components/ui/primitives";
import { districtName, fmtDate, fmtNum, getDict, isLang } from "@/lib/i18n";
import { getKnowledge } from "@/lib/server/data";
import { landReport } from "@/lib/server/land";
import { resolveLocation } from "@/lib/server/location";

export async function generateMetadata({ params }: PageProps<"/[lang]/land">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: getDict(lang).nav.land } : {};
}

export default async function LandIndex({ params }: PageProps<"/[lang]/land">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  const K = await getKnowledge();
  const reports = await Promise.all(K.regions.map(async (r) => ({ r, rep: await landReport(await resolveLocation({ region: r.id })) })));
  return (
    <>
      <PageHead eyebrow={d.brand} title={d.nav.land} lead={d.land.pick} />
      <Container className="space-y-12 py-10">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map(({ r, rep }) => {
            const clim = rep.clim as Record<string, number>[];
            const hot = clim.reduce((a, b) => (b.tmax > a.tmax ? b : a));
            const ann = (rep.annual as Record<string, number>[]).filter((a) => a.year >= rep.years[0]);
            const rain = ann.reduce((a, x) => a + x.rain, 0) / ann.length;
            return (
              <Link key={r.id} href={`/${lang}/land/${r.id}`} className="card group p-5 transition hover:-translate-y-0.5 hover:border-soil-500">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl text-forest-900">{districtName(lang, r.id)}</h2>
                  <span className="text-[0.8rem] text-ink-500">{(d.zones as Record<string, string>)[r.zone]}</span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-[0.82rem]">
                  <div><dt className="text-ink-500">{d.land.kpis.heat}</dt><dd className="tnum font-display text-lg text-clay-700">{fmtNum(lang, hot.tmax, 1)}°</dd></div>
                  <div><dt className="text-ink-500">{d.land.kpis.rain}</dt><dd className="tnum font-display text-lg text-water-700">{fmtNum(lang, rain)}</dd></div>
                  <div><dt className="text-ink-500">NDVI</dt><dd className="tnum font-display text-lg text-olive-700">{fmtNum(lang, rep.ndvi?.latest.ndvi ?? null, 2)}</dd></div>
                </dl>
                <p className="mt-3 text-[0.78rem] text-ink-400">{rep.ndvi ? fmtDate(lang, rep.ndvi.latest.date) : ""}</p>
              </Link>
            );
          })}
        </section>
        <section>
          <SectionTitle>{d.advisor.pickMap}</SectionTitle>
          <div className="card p-4">
            <LandPicker lang={lang} />
          </div>
        </section>
      </Container>
    </>
  );
}
