"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Logo";

type Item = { href: string; label: string };

export function Header({ lang, brand, items, langLabel, langTitle, menu, close, skip }: {
  lang: "en" | "ur"; brand: string; items: Item[]; langLabel: string; langTitle: string; menu: string; close: string; skip: string;
}) {
  const pathname = usePathname() || `/${lang}`;
  const [open, setOpen] = useState(false);
  const other = lang === "en" ? "ur" : "en";
  const switchHref = pathname.replace(/^\/(en|ur)(?=\/|$)/, `/${other}`);
  const active = (href: string) => (href === `/${lang}` ? pathname === href : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2">{skip}</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={`/${lang}`} className="shrink-0" aria-label={brand}>
          <Wordmark name={brand} />
        </Link>
        <nav className="ms-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {items.map((it) => (
            <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined}
              className={`rounded-full px-3.5 py-2 text-[0.94rem] transition-colors ${active(it.href) ? "bg-forest-900 text-cream" : "text-ink-600 hover:bg-beige-200/70 hover:text-ink-900"}`}>
              {it.label}
            </Link>
          ))}
        </nav>
        <Link href={switchHref} prefetch={false} title={langTitle} lang={other}
          onClick={() => { document.cookie = `lang=${other}; path=/; max-age=31536000; samesite=lax`; }}
          className={`ms-auto rounded-full border border-soil-300/60 px-3.5 py-1.5 text-sm font-medium text-soil-800 transition hover:border-soil-500 hover:bg-beige-100 lg:ms-2 ${other === "ur" ? "font-urdu" : "font-sans"}`}>
          {langLabel}
        </Link>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav"
          className="rounded-lg p-2 text-ink-700 hover:bg-beige-200/70 lg:hidden" aria-label={open ? close : menu}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
          </svg>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="animate-fade border-t hairline bg-paper px-4 pb-4 pt-2 lg:hidden" aria-label="Main">
          {items.map((it) => (
            <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined} onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-3 text-base ${active(it.href) ? "bg-forest-900 text-cream" : "text-ink-700 hover:bg-beige-100"}`}>
              {it.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
