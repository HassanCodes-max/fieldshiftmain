/** Aerial view of strip-cropped fields under a satellite pass, with two real readings as callouts. */
export function FieldIllustration({ ndvi, ndviLabel, rain, rainLabel }: { ndvi: string; ndviLabel: string; rain: string; rainLabel: string }) {
  const strips = [
    { c: "#c8962e", w: 46 }, { c: "#5e6b2f", w: 30 }, { c: "#d9ae4f", w: 54 }, { c: "#86613f", w: 22 }, { c: "#3e6e7e", w: 38 },
    { c: "#c8962e", w: 34 }, { c: "#76833f", w: 48 }, { c: "#b8987a", w: 26 }, { c: "#5e6b2f", w: 40 },
  ];
  let x = 0;
  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-hidden="true">
      <svg viewBox="0 0 520 440" className="h-auto w-full">
        <defs>
          <clipPath id="plot"><path d="M40 150 L480 110 L500 400 L20 420 Z" /></clipPath>
          <pattern id="rows" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-84)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(28,26,21,.18)" strokeWidth="1.2" />
          </pattern>
        </defs>
        <path d="M40 150 L480 110 L500 400 L20 420 Z" fill="#e8dec8" />
        <g clipPath="url(#plot)" transform="skewY(-5) translate(0 40)">
          {strips.map((s, i) => {
            const r = <rect key={i} x={x + 20} y="100" width={s.w} height="340" fill={s.c} className="chart-bar" style={{ animationDelay: `${i * 60}ms` }} />;
            x += s.w + 3;
            return r;
          })}
          <rect x="0" y="80" width="520" height="380" fill="url(#rows)" />
        </g>
        <path d="M40 150 L480 110 L500 400 L20 420 Z" fill="none" stroke="#5b3e26" strokeOpacity=".35" />
        <path d="M30 96 C150 20 360 10 500 62" fill="none" stroke="#5b3e26" strokeOpacity=".5" strokeDasharray="3 6" />
        <g transform="translate(372 30) rotate(18)">
          <rect x="-14" y="-6" width="28" height="12" rx="2" fill="#1b3527" />
          <rect x="-40" y="-4" width="22" height="8" fill="#3e6e7e" />
          <rect x="18" y="-4" width="22" height="8" fill="#3e6e7e" />
          <path d="M0 6 L-36 120 M0 6 L40 112" stroke="#c8962e" strokeOpacity=".55" strokeDasharray="2 4" />
        </g>
      </svg>
      <div className="absolute start-[4%] top-[48%] rounded-xl border hairline bg-paper/95 px-3.5 py-2.5 shadow-sm animate-rise" style={{ animationDelay: "500ms" }}>
        <div className="text-[0.7rem] text-ink-500">{ndviLabel}</div>
        <div className="tnum font-display text-xl text-olive-700">{ndvi}</div>
      </div>
      <div className="absolute bottom-[8%] end-[2%] rounded-xl border hairline bg-paper/95 px-3.5 py-2.5 shadow-sm animate-rise" style={{ animationDelay: "750ms" }}>
        <div className="text-[0.7rem] text-ink-500">{rainLabel}</div>
        <div className="tnum font-display text-xl text-water-700">{rain}</div>
      </div>
    </div>
  );
}
