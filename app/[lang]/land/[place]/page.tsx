import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LandReportView } from "@/components/land/LandReportView";
import { Container, Skeleton } from "@/components/ui/primitives";
import { districtName, getDict, isLang, t, type Lang } from "@/lib/i18n";
import { landReport } from "@/lib/server/land";
import { LocationError, resolveLocation } from "@/lib/server/location";
import { REGION_IDS } from "@/lib/validation";

export function generateStaticParams() {
  return REGION_IDS.map((place) => ({ place }));
}

function parsePlace(place: string): { region: string } | { lat: number; lon: number } | null {
  const p = decodeURIComponent(place);
  if ((REGION_IDS as readonly string[]).includes(p)) return { region: p };
  const m = p.match(/^(-?\d{1,2}(?:\.\d{1,4})?),(-?\d{1,3}(?:\.\d{1,4})?)$/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/land/[place]">): Promise<Metadata> {
  const { lang, place } = await params;
  if (!isLang(lang)) return {};
  const ref = parsePlace(place);
  const name = ref && "region" in ref ? districtName(lang, ref.region) : decodeURIComponent(place);
  return { title: t(getDict(lang).land.title, { place: name }) };
}

async function Content({ lang, place }: { lang: Lang; place: string }) {
  const ref = parsePlace(place);
  if (!ref) notFound();
  // A map point downloads live NASA data: always render it at request time, never as part of a prerendered shell
  // (otherwise the download is cut off and shows up as "NASA did not respond").
  if (!("region" in ref)) await connection();
  let report: Awaited<ReturnType<typeof landReport>> | null = null;
  let error: string | null = null;
  try {
    report = await landReport(await resolveLocation(ref));
  } catch (e) {
    if (!(e instanceof LocationError)) throw e;
    error = e.code;
  }
  if (!report) {
    const d = getDict(lang);
    return <Container className="py-16"><p className="card p-6 text-lg text-clay-700">{(d.errors as Record<string, string>)[error ?? ""] ?? d.errors.internal_error}</p></Container>;
  }
  return <LandReportView lang={lang} r={report} />;
}

async function Resolved({ params }: { params: PageProps<"/[lang]/land/[place]">["params"] }) {
  const { lang, place } = await params;
  if (!isLang(lang)) notFound();
  return <Content lang={lang} place={place} />;
}

export default function LandPlacePage({ params }: PageProps<"/[lang]/land/[place]">) {
  return (
    <Suspense fallback={<Container className="space-y-6 py-12"><Skeleton className="h-28" /><Skeleton className="h-32" /><Skeleton className="h-80" /></Container>}>
      <Resolved params={params} />
    </Suspense>
  );
}
