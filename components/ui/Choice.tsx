"use client";

import type { ReactNode } from "react";

/** Single-choice group of large tap targets (radio semantics). */
export function Choice<T extends string>({ value, options, onChange, label, columns }: {
  value: T | null; options: { value: T; label: ReactNode; hint?: ReactNode }[]; onChange: (v: T) => void; label: string; columns?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={columns ? "grid gap-2" : "flex flex-wrap gap-2"}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-xl border px-3.5 py-2 text-start text-[0.95rem] transition-all duration-150 ${columns ? "w-full" : ""} ${on
              ? "border-forest-900 bg-forest-900 text-cream shadow-[inset_0_-2px_0_rgba(200,150,46,.9)]"
              : "border-soil-200 bg-paper text-ink-700 hover:border-soil-500 hover:bg-beige-100"}`}>
            <span className="block">{o.label}</span>
            {o.hint && <span className={`block text-[0.78rem] ${on ? "text-beige-200" : "text-ink-400"}`}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ value, onChange, yes, no, label }: { value: boolean; onChange: (v: boolean) => void; yes: string; no: string; label: string }) {
  return <Choice label={label} value={value ? "y" : "n"} onChange={(v) => onChange(v === "y")} options={[{ value: "n", label: no }, { value: "y", label: yes }]} />;
}
