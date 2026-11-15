import { cropName, getDict, type Lang } from "@/lib/i18n";

export const CROP_COLOR: Record<string, string> = { rice: "#3e6e7e", wheat: "#c8962e", maize: "#d9ae4f", mungbean: "#5e6b2f", cotton: "#86613f" };
export const CROP_INK: Record<string, string> = { rice: "#fff", wheat: "#33241a", maize: "#33241a", mungbean: "#fff", cotton: "#fff" };

const doy = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  const y = new Date(t).getUTCFullYear();
  return Math.floor((t - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
};

/** One row per rotation: when each crop occupies the field across the year (wraps over 31 Dec). */
export function CropCalendar({ lang, rows }: { lang: Lang; rows: { label: string; slots: { crop: string; sow: string; harvest: string }[]; highlight?: boolean }[] }) {
  const d = getDict(lang);
  return (
    <div className="space-y-2.5" style={{ direction: "ltr" }}>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(4.5rem,7rem)_1fr] items-center gap-3">
          <span className={`truncate text-[0.82rem] ${r.highlight ? "font-semibold text-forest-900" : "text-ink-600"}`} dir={d.dir}>{r.label}</span>
          <div className="relative h-8 overflow-hidden rounded-md bg-beige-100 field-rows">
            {r.slots.flatMap((s, si) => {
              const a = doy(s.sow);
              const b = doy(s.harvest);
              const parts = b >= a ? [[a, b]] : [[a, 366], [1, b]];
              return parts.map(([p, q], pi) => (
                <span key={`${si}-${pi}`} className="grow-x absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-[5px] px-1 text-[0.72rem] font-medium"
                  style={{ left: `${((p - 1) / 365) * 100}%`, width: `${((q - p) / 365) * 100}%`, background: CROP_COLOR[s.crop], color: CROP_INK[s.crop], animationDelay: `${si * 120}ms` }}
                  title={cropName(lang, s.crop)}>
                  <span className="truncate" dir={d.dir}>{q - p > 45 ? cropName(lang, s.crop) : ""}</span>
                </span>
              ));
            })}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(4.5rem,7rem)_1fr] gap-3">
        <span />
        <div className="grid grid-cols-12 text-center text-[0.68rem] text-ink-400">
          {d.monthsShort.map((m) => <span key={m}>{lang === "ur" ? m.slice(0, 3) : m[0]}</span>)}
        </div>
      </div>
    </div>
  );
}
