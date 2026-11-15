import en, { type Dict } from "./en";
import ur from "./ur";

export const LANGS = ["en", "ur"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (x: string): x is Lang => (LANGS as readonly string[]).includes(x);
export const DICTS: Record<Lang, Dict> = { en, ur };
export const getDict = (lang: Lang): Dict => DICTS[lang];
export type { Dict };

/** "{a} of {b}" interpolation. */
export function t(template: string, vars: Record<string, string | number | null | undefined> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

const nfCache = new Map<string, Intl.NumberFormat>();
export function fmtNum(lang: Lang, x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const key = `${lang}|${digits}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(DICTS[lang].locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nfCache.set(key, nf);
  }
  return nf.format(x);
}

/** Digits only (years, counts in text) — keeps "2026" unseparated. */
export function fmtInt(lang: Lang, x: number): string {
  const s = String(Math.round(x));
  return lang === "ur" ? s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : s;
}

export function digits(lang: Lang, s: string): string {
  return lang === "ur" ? s.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : s;
}

const MS_DAY = 86_400_000;
/** Date from an ISO string or a day number, e.g. "14 Nov 2026". */
export function fmtDate(lang: Lang, d: string | number, opts: { year?: boolean; weekday?: boolean } = { year: true }): string {
  const date = typeof d === "number" ? new Date(d * MS_DAY) : new Date(`${d.slice(0, 10)}T12:00:00Z`);
  const D = DICTS[lang];
  const day = fmtInt(lang, date.getUTCDate());
  const month = (lang === "ur" ? D.months : D.monthsShort)[date.getUTCMonth()];
  const year = opts.year === false ? "" : ` ${fmtInt(lang, date.getUTCFullYear())}`;
  if (opts.weekday) {
    const wd = new Intl.DateTimeFormat(lang === "ur" ? "ur-PK" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
    return `${wd} ${day}`;
  }
  return `${day} ${month}${year}`;
}

export const cropName = (lang: Lang, id: string) => (DICTS[lang].crops as Record<string, string>)[id] ?? id;
export const districtName = (lang: Lang, id: string) => (DICTS[lang].districts as Record<string, string>)[id] ?? id;
export const rotationName = (lang: Lang, crops: string[]) => crops.map((c) => cropName(lang, c)).join(lang === "ur" ? " ← " : " → ");
export const listJoin = (lang: Lang, items: string[]) => items.join(lang === "ur" ? "، " : ", ");

export const money = (lang: Lang, x: number | null | undefined) => t(DICTS[lang].money, { n: fmtNum(lang, x) });
export const placeName = (lang: Lang, raw: string) => (DICTS[lang].places as Record<string, string>)[raw] ?? raw;
export const commodityName = (lang: Lang, raw: string) => (DICTS[lang].commodities as Record<string, string>)[raw] ?? raw;
export const src = (lang: Lang, k: string) => (DICTS[lang].src as Record<string, string>)[k] ?? k;
