import Link from "next/link";
import type { ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-harvest-700 rtl:normal-case rtl:tracking-normal rtl:text-base">{children}</p>;
}

export function PageHead({ eyebrow, title, lead, children }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b hairline">
      <Container className="py-10 sm:py-14">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-2 font-display text-[2.1rem] leading-[1.08] text-forest-900 sm:text-5xl">{title}</h1>
        {lead && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">{lead}</p>}
        {children}
      </Container>
    </div>
  );
}

export type Origin = "observed" | "model" | "estimated" | "forecast" | "farmer";
const ORIGIN_STYLE: Record<Origin, string> = {
  observed: "bg-olive-100 text-olive-800",
  model: "bg-beige-200 text-soil-800",
  estimated: "bg-harvest-100 text-harvest-800",
  forecast: "bg-water-100 text-water-800",
  farmer: "bg-forest-100 text-forest-800",
};
export function OriginBadge({ kind, label }: { kind: Origin; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.72rem] font-medium ${ORIGIN_STYLE[kind]}`}>{label}</span>;
}

export function Stat({ label, value, sub, badge, tone = "default" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; badge?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const ring = { default: "", good: "border-s-4 border-s-olive-500", warn: "border-s-4 border-s-harvest-500", bad: "border-s-4 border-s-clay-600" }[tone];
  return (
    <div className={`card flex min-w-0 flex-col gap-1 p-4 ${ring}`}>
      <div className="flex items-center justify-between gap-2 text-sm text-ink-500">
        <span className="truncate">{label}</span>
        {badge}
      </div>
      <div className="tnum font-display text-[1.75rem] leading-tight text-ink-900">{value}</div>
      {sub && <div className="text-[0.85rem] leading-snug text-ink-500">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-beige-200/70 ${className}`} aria-hidden="true" />;
}

export function ButtonLink({ href, children, variant = "primary", className = "", prefetch }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string; prefetch?: boolean }) {
  const v = {
    primary: "bg-forest-900 text-cream hover:bg-forest-800 shadow-[0_1px_0_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.08)]",
    secondary: "border border-soil-300 bg-paper text-soil-900 hover:border-soil-500 hover:bg-beige-100",
    ghost: "text-forest-800 hover:bg-beige-200/60",
  }[variant];
  return (
    <Link href={href} prefetch={prefetch} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.98rem] font-medium transition-colors ${v} ${className}`}>
      {children}
    </Link>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-display text-2xl text-forest-900 sm:text-[1.7rem]">{children}</h2>
      {aside}
    </div>
  );
}

export function Level({ level, label, highIsGood = false }: { level: "Low" | "Moderate" | "High"; label: string; highIsGood?: boolean }) {
  const good = "bg-olive-100 text-olive-800";
  const bad = "bg-clay-100 text-clay-800";
  const s = level === "Moderate" ? "bg-harvest-100 text-harvest-800" : (level === "High") === highIsGood ? good : bad;
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-sm font-medium ${s}`}>{label}</span>;
}
