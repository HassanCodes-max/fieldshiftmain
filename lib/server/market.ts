import "server-only";
import { getPriceSeed } from "./data";
import { getDb, type Db } from "./db";

/**
 * Punjab AMIS wholesale prices (Directorate of Agriculture, Economics & Marketing Punjab).
 * Port of pipeline/scripts/fetch_amis.py — run daily by Vercel Cron (/api/cron/amis) so the history grows.
 * Prices are WHOLESALE market prices in Rs per 100 kg, not farm-gate prices.
 */
export const AMIS_URL = "http://www.amis.pk/"; // AMIS does not serve HTTPS
export const CROP_OF: Record<string, string> = {
  Wheat: "wheat",
  "Rice (IRRI)": "rice", "Rice Basmati (385)": "rice", "Rice Basmati Super (New)": "rice", "Rice Basmati Super (Old)": "rice",
  "Rice Kainat (New)": "rice", "Rice Kainat Old": "rice", "Paddy (IRRI)": "rice", "Paddy Basmati": "rice", "Paddy Kainat": "rice",
  Maize: "maize",
  Moong: "mungbean",
  "Cotton(Phutti)": "cotton", "Seed Cotton(Phutti)": "cotton",
};
/** Commodity used as the headline price of each crop (first one present wins). */
export const HEADLINE: Record<string, string[]> = {
  wheat: ["Wheat"], rice: ["Rice (IRRI)", "Paddy (IRRI)"], maize: ["Maize"], mungbean: ["Moong"], cotton: ["Seed Cotton(Phutti)", "Cotton(Phutti)"],
};
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const MONTH_NUM: Record<string, number> = Object.fromEntries(MONTHS.split("|").map((m, i) => [m, i + 1]));

export interface PriceRow { commodity: string; crop: string; market: string; date: string; price: number }

function toText(html: string): string {
  let t = html.replace(/<[^>]+>/g, "|");
  t = t.replace(/(&nbsp;|\s)+/g, " ");
  return t.replace(/\|[ |]*/g, "|");
}

export function parseAmis(html: string, today = new Date()): PriceRow[] {
  const t = toText(html);
  const m = t.match(new RegExp(`(\\d{1,2}) (${MONTHS})[a-z]* (20\\d\\d)`));
  const date = m
    ? `${m[3]}-${String(MONTH_NUM[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`
    : today.toISOString().slice(0, 10);
  const starts = [...t.matchAll(/\|([A-Z][A-Za-z .]{2,25})\|(?=[A-Z][^|]* \d)/g)];
  const rows: PriceRow[] = [];
  const seen = new Set<string>();
  starts.forEach((s, i) => {
    const from = (s.index ?? 0) + s[0].length;
    const to = i + 1 < starts.length ? starts[i + 1].index ?? from : from + 6000;
    const block = t.slice(from, to);
    for (const [, rawName, price] of block.matchAll(/([A-Za-z][^|\d]*?) (\d+(?:\.\d+)?)(?= |\||$)/g)) {
      const name = rawName.trim();
      const crop = CROP_OF[name];
      if (!crop) continue;
      const market = s[1].trim();
      const k = `${name}|${market}|${date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ commodity: name, crop, market, date, price: Number(price) });
    }
  });
  return rows;
}

async function upsert(db: Db, rows: PriceRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    if (!(r.price > 0) || r.price > 10_000_000) continue;
    await db.query(
      `insert into market_prices (commodity, crop, market, price_date, price) values ($1, $2, $3, $4, $5)
       on conflict (commodity, market, price_date) do update set price = excluded.price, fetched_at = now()`,
      [r.commodity, r.crop, r.market, r.date, r.price],
    );
    n++;
  }
  return n;
}

export async function refreshAmis(): Promise<{ rows: number; markets: number; date: string }> {
  const r = await fetch(AMIS_URL, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "FieldShift/2.0 (crop-rotation advisory)" } });
  if (!r.ok) throw new Error(`AMIS HTTP ${r.status}`);
  const rows = parseAmis(await r.text());
  if (!rows.length) throw new Error("No prices found: the AMIS page layout may have changed");
  const db = await getDb();
  const n = await upsert(db, rows);
  return { rows: n, markets: new Set(rows.map((x) => x.market)).size, date: rows[0].date };
}

async function ensureSeeded(db: Db) {
  const c = await db.query<{ n: string }>("select count(*)::text as n from market_prices");
  if (Number(c[0].n) === 0) await upsert(db, await getPriceSeed());
}

export interface MarketSummary {
  date: string | null;
  markets: number;
  snapshots: number;
  lastFetched: string | null;
  crops: Record<string, {
    commodity: string; median: number; min: number; max: number; n: number;
    markets: { market: string; price: number }[];
    varieties: { commodity: string; median: number; n: number }[];
  }>;
  history: { date: string; crop: string; median: number }[];
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Row = { commodity: string; crop: string; market: string; d: string; price: number; f: Date | null };

/** Prices from the database; if it is unavailable, the AMIS snapshot bundled with the app (never an empty page). */
export async function marketSummary(): Promise<MarketSummary> {
  let rows: Row[];
  try {
    const db = await getDb();
    await ensureSeeded(db);
    rows = (await db.query<{ commodity: string; crop: string; market: string; d: string; price: string; f: Date }>(
      `select commodity, crop, market, to_char(price_date, 'YYYY-MM-DD') as d, price::text as price, fetched_at as f
       from market_prices where price_date > current_date - interval '400 days'`,
    )).map((r) => ({ ...r, price: Number(r.price) }));
  } catch (e) {
    console.error("[market] database unavailable, using bundled snapshot:", e instanceof Error ? e.message : e);
    rows = (await getPriceSeed()).map((r) => ({ commodity: r.commodity, crop: r.crop, market: r.market, d: r.date, price: r.price, f: null }));
  }
  return summarize(rows);
}

function summarize(rows: Row[]): MarketSummary {
  if (!rows.length) return { date: null, markets: 0, snapshots: 0, lastFetched: null, crops: {}, history: [] };
  const date = rows.reduce((a, r) => (r.d > a ? r.d : a), "");
  const latest = rows.filter((r) => r.d === date);
  const crops: MarketSummary["crops"] = {};
  const history: MarketSummary["history"] = [];
  for (const [crop, names] of Object.entries(HEADLINE)) {
    const x = latest.filter((r) => r.crop === crop);
    const head = names.find((n) => x.some((r) => r.commodity === n));
    if (!head) continue;
    const h = x.filter((r) => r.commodity === head).sort((a, b) => a.price - b.price);
    const others = [...new Set(x.map((r) => r.commodity))].filter((c) => c !== head);
    crops[crop] = {
      commodity: head, median: median(h.map((r) => r.price)), min: h[0].price, max: h.at(-1)!.price, n: h.length,
      markets: h.map((r) => ({ market: r.market, price: r.price })),
      varieties: others.map((c) => {
        const v = x.filter((r) => r.commodity === c).map((r) => r.price);
        return { commodity: c, median: median(v), n: v.length };
      }),
    };
    const byDate = new Map<string, number[]>();
    for (const r of rows) if (r.commodity === head) byDate.set(r.d, [...(byDate.get(r.d) ?? []), r.price]);
    for (const [d, v] of [...byDate.entries()].sort()) history.push({ date: d, crop, median: median(v) });
  }
  const fetched = rows.filter((r) => r.f).map((r) => new Date(r.f as Date).getTime());
  return {
    date, markets: new Set(latest.map((r) => r.market)).size, snapshots: new Set(rows.map((r) => r.d)).size,
    lastFetched: fetched.length ? new Date(Math.max(...fetched)).toISOString() : null, crops, history,
  };
}
