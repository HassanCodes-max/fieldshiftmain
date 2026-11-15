"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { districtName, fmtNum, getDict, type Lang } from "@/lib/i18n";

const PickMap = dynamic(() => import("@/components/map/PickMap"), { ssr: false, loading: () => <Skeleton className="h-[460px] w-full" /> });
const POINTS: [string, number, number][] = [["faisalabad", 31.3, 73.25], ["sheikhupura", 31.65, 73.8], ["gujranwala", 32.1, 73.95], ["hafizabad", 32.0, 73.6], ["okara", 30.7, 73.35], ["multan", 30.1, 71.6]];

export function LandPicker({ lang }: { lang: Lang }) {
  const d = getDict(lang);
  const router = useRouter();
  const [pt, setPt] = useState<{ lat: number; lon: number } | null>(null);
  const [going, setGoing] = useState(false);
  return (
    <div>
      <PickMap height={460} value={pt} onPick={(lat, lon) => setPt({ lat, lon })}
        points={POINTS.map(([id, lat, lon]) => ({ id, lat, lon, label: districtName(lang, id) }))}
        onPointClick={(id) => router.push(`/${lang}/land/${id}`)} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.9rem] text-ink-600">{pt ? <span className="tnum">{fmtNum(lang, pt.lat, 2)}°, {fmtNum(lang, pt.lon, 2)}°</span> : d.advisor.mapHint}</p>
        <button type="button" disabled={!pt || going}
          onClick={() => { if (!pt) return; setGoing(true); router.push(`/${lang}/land/${pt.lat.toFixed(2)},${pt.lon.toFixed(2)}`); }}
          className="min-h-11 rounded-full bg-forest-900 px-5 font-medium text-cream disabled:opacity-40">
          {going ? d.advisor.fetchingNasa : d.advisor.mapUse}
        </button>
      </div>
    </div>
  );
}
