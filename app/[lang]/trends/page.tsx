import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DistrictYears } from "@/components/trends/TrendMap";
import { TrendMapLazy } from "@/components/trends/TrendMapLazy";
import { Container, PageHead } from "@/components/ui/primitives";
import { getDict, isLang } from "@/lib/i18n";
import { getKnowledge } from "@/lib/server/data";
import { landReport } from "@/lib/server/land";
import { resolveLocation } from "@/lib/server/location";

export async function generateMetadata({ params }: PageProps<"/[lang]/trends">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: getDict(lang).trends.title } : {};
}

async function districtYears(): Promise<DistrictYears[]> {
  const K = await getKnowledge();
  return Promise.all(K.regions.map(async (r) => {
    const loc = await resolveLocation({ region: r.id });
    const rep = await landReport(loc);
    const years: DistrictYears["years"] = {};
    for (const a of rep.annual as Record<string, number | null>[]) {
      years[String(a.year)] = { hotDays: a.hotDays, tmaxMean: a.tmaxMean, rain: a.rain, ndviPeak: null, smap: null };
    }
    for (const p of rep.ndvi?.peaks ?? []) {
      const v = Math.max(p.rabi ?? -1, p.kharif ?? -1);
      if (years[String(p.year)] && v > 0) years[String(p.year)].ndviPeak = v;
    }
    if (loc.smap) {
      const by = new Map<string, number[]>();
      loc.smap.dates.forEach((dt, i) => by.set(dt.slice(0, 4), [...(by.get(dt.slice(0, 4)) ?? []), loc.smap!.sm[i]]));
      for (const [y, v] of by) if (years[y] && v.length > 200) years[y].smap = v.reduce((a, b) => a + b, 0) / v.length;
    }
    return { id: r.id, lat: r.lat, lon: r.lon, years };
  }));
}

export default async function TrendsPage({ params }: PageProps<"/[lang]/trends">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  return (
    <>
      <PageHead eyebrow={`${d.src.power} · ${d.src.modis} · ${d.src.smap}`} title={d.trends.title} lead={d.trends.lead} />
      <Container className="py-10">
        <TrendMapLazy lang={lang} data={await districtYears()} />
      </Container>
    </>
  );
}
