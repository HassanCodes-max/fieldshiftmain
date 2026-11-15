import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { getDict, type Lang } from "@/lib/i18n";

export function Footer({ lang }: { lang: Lang }) {
  const d = getDict(lang);
  const links = [
    [`/${lang}/advisor`, d.nav.advisor], [`/${lang}/land`, d.nav.land], [`/${lang}/market`, d.nav.market],
    [`/${lang}/trends`, d.nav.trends], [`/${lang}/methods`, d.nav.methods],
  ];
  return (
    <footer className="mt-20 border-t hairline bg-forest-950 text-beige-200">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-9" />
            <span className="font-display text-xl text-cream">{d.brand}</span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-beige-300">{d.footer.disclaimer}</p>
          <p className="mt-3 max-w-md text-sm text-soil-300">{d.footer.built}</p>
        </div>
        <nav className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm" aria-label="Footer">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="text-beige-200 hover:text-harvest-400">{label}</Link>
          ))}
          {/* plain link on purpose: a JSON API endpoint, not a page */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/health" className="text-soil-300 hover:text-harvest-400" rel="nofollow">{d.footer.status}</a>
        </nav>
      </div>
    </footer>
  );
}
