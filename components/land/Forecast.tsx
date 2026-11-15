import { connection } from "next/server";
import { fmtDate, fmtNum, getDict, t, type Lang } from "@/lib/i18n";
import { getForecast } from "@/lib/server/forecast";

const icon = (rain: number, tmax: number) => (rain >= 5 ? "rain" : rain >= 1 ? "drizzle" : tmax >= 40 ? "heat" : "sun");

function Glyph({ kind }: { kind: string }) {
  const c = { rain: "#3e6e7e", drizzle: "#79a3b0", heat: "#a24e2d", sun: "#c8962e" }[kind];
  return (
    <svg viewBox="0 0 32 32" className="mx-auto h-8 w-8" aria-hidden="true">
      {kind === "sun" || kind === "heat" ? (
        <>
          <circle cx="16" cy="16" r="6" fill={c} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="16" y1="4" x2="16" y2="7.5" stroke={c} strokeWidth="2" strokeLinecap="round" transform={`rotate(${a} 16 16)`} />)}
        </>
      ) : (
        <>
          <path d="M9 19a5 5 0 0 1 1-9.9A7 7 0 0 1 23 11a4.5 4.5 0 0 1 0 8z" fill="#d6c2ac" />
          {(kind === "rain" ? [11, 16, 21] : [13, 19]).map((x) => <line key={x} x1={x} y1="22" x2={x - 1.5} y2="27" stroke={c} strokeWidth="2" strokeLinecap="round" />)}
        </>
      )}
    </svg>
  );
}

export async function Forecast({ lang, lat, lon }: { lang: Lang; lat: number; lon: number }) {
  await connection(); // always a fresh forecast at request time (the server still caches it for an hour)
  const d = getDict(lang);
  const f = await getForecast(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
  if (!f) return <p className="text-ink-500">{d.land.forecastNone}</p>;
  return (
    <div>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {f.days.map((x) => (
          <li key={x.date} className="card px-2 py-3 text-center">
            <div className="text-[0.78rem] text-ink-500">{fmtDate(lang, x.date, { weekday: true })}</div>
            <Glyph kind={icon(x.rain, x.tmax)} />
            <div className="tnum text-[0.95rem] font-medium text-ink-900">{fmtNum(lang, x.tmax)}° <span className="text-ink-400">{fmtNum(lang, x.tmin)}°</span></div>
            <div className="tnum text-[0.75rem] text-water-700">{fmtNum(lang, x.rain)} {d.common.mm}</div>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2">
        {f.tips.map((tip, i) => (
          <li key={i} className="rounded-xl border-s-4 border-s-harvest-500 bg-paper px-4 py-3 text-[0.95rem] text-ink-700">
            {t(d.wx[tip.k], { mm: tip.mm !== undefined ? fmtNum(lang, tip.mm) : "", t: tip.t !== undefined ? fmtNum(lang, tip.t) : "", day: tip.day ? fmtDate(lang, tip.day, { weekday: true }) : "" })}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.78rem] text-ink-400">{d.land.forecastSource}</p>
    </div>
  );
}
