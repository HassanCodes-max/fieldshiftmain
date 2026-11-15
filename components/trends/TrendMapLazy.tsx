"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";
import type { DistrictYears } from "./TrendMap";
import type { Lang } from "@/lib/i18n";

const TrendMap = dynamic(() => import("./TrendMap").then((m) => m.TrendMap), { ssr: false, loading: () => <Skeleton className="h-[560px] w-full" /> });

export function TrendMapLazy(props: { lang: Lang; data: DistrictYears[] }) {
  return <TrendMap {...props} />;
}
