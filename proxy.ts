import { NextResponse, type NextRequest } from "next/server";

const LANGS = ["en", "ur"];

/** Send "/" and un-prefixed paths to /en/… or /ur/… (saved choice → browser language → English). */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LANGS.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return NextResponse.next();
  const saved = req.cookies.get("lang")?.value;
  const accept = req.headers.get("accept-language") || "";
  const lang = saved && LANGS.includes(saved) ? saved : /(^|,)\s*ur\b/i.test(accept) ? "ur" : "en";
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|icon|apple-icon|robots.txt|sitemap.xml|manifest.webmanifest|.*\\..*).*)"],
};
