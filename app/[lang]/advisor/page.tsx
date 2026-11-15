import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Advisor } from "@/components/advisor/Advisor";
import { Container, PageHead, Skeleton } from "@/components/ui/primitives";
import { getDict, isLang } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[lang]/advisor">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: getDict(lang).advisor.title, description: getDict(lang).advisor.lead } : {};
}

function AdvisorFallback() {
  return (
    <div className="grid gap-6 lg:grid-cols-[5fr_6fr]">
      <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-80" /></div>
    </div>
  );
}

export default async function AdvisorPage({ params }: PageProps<"/[lang]/advisor">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  return (
    <>
      <PageHead eyebrow={d.brand} title={d.advisor.title} lead={d.advisor.lead} />
      <Container className="py-8 pb-28 lg:pb-12">
        <Suspense fallback={<AdvisorFallback />}>
          <Advisor lang={lang} />
        </Suspense>
      </Container>
    </>
  );
}
