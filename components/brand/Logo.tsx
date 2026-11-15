/** Field Shift mark: furrows converging to the horizon under a satellite's orbit. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#14281d" />
      <path d="M6 33 L18 21 M12 34 L19.5 21.5 M20 34.5 L20.5 21.5 M28 34 L21.5 21.5 M34 33 L22.5 21" stroke="#c8962e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 21.5 H35" stroke="#76833f" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8.5 16 A13 9 0 0 1 31.5 13" fill="none" stroke="#e8dec8" strokeWidth="1.1" strokeDasharray="1.6 2.2" strokeLinecap="round" />
      <circle cx="31.5" cy="13" r="2.2" fill="#f8f3e8" />
    </svg>
  );
}

export function Wordmark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.2rem] font-semibold tracking-tight text-forest-900">{name}</span>
    </span>
  );
}
