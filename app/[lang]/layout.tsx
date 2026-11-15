import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans, Noto_Nastaliq_Urdu } from "next/font/google";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand/Logo";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { getDict, isLang, LANGS } from "@/lib/i18n";
import "../globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "opsz"], display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "600", "700"], variable: "--font-nastaliq", display: "swap", preload: false });

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const d = getDict(lang);
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return {
    metadataBase: new URL(base),
    title: { default: d.meta.title, template: `%s · ${d.brand}` },
    description: d.meta.description,
    alternates: { canonical: `/${lang}`, languages: { en: "/en", ur: "/ur" } },
    openGraph: { title: d.meta.title, description: d.meta.description, type: "website", locale: lang === "ur" ? "ur_PK" : "en_PK", siteName: d.brand },
  };
}

export const viewport: Viewport = { themeColor: "#14281d", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  const items = [
    { href: `/${lang}/advisor`, label: d.nav.advisor },
    { href: `/${lang}/land`, label: d.nav.land },
    { href: `/${lang}/market`, label: d.nav.market },
    { href: `/${lang}/trends`, label: d.nav.trends },
    { href: `/${lang}/methods`, label: d.nav.methods },
  ];
  return (
    <html lang={lang} dir={d.dir} className={`${fraunces.variable} ${instrument.variable} ${nastaliq.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <Suspense fallback={<div className="sticky top-0 z-40 h-16 border-b hairline bg-cream/90"><div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6"><Wordmark name={d.brand} /></div></div>}>
          <Header lang={lang} brand={d.brand} items={items} langLabel={d.nav.language} langTitle={d.nav.languageLabel} menu={d.nav.menu} close={d.nav.close} skip={d.nav.skip} />
        </Suspense>
        <main id="main" className="flex-1">{children}</main>
        <Footer lang={lang} />
      </body>
    </html>
  );
}
