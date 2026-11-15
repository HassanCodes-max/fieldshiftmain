"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export interface MapPoint { id: string; lat: number; lon: number; label: string }

const BOUNDS = { latMin: 23.5, latMax: 37.2, lonMin: 60.8, lonMax: 77.9 };
const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS = "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

/** Satellite map (Esri World Imagery) for choosing a field; preset districts shown as gold dots. */
export default function PickMap({ value, onPick, points, onPointClick, height = 420 }: {
  value: { lat: number; lon: number } | null; onPick: (lat: number, lon: number) => void; points: MapPoint[]; onPointClick?: (id: string) => void; height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, maxBounds: [[BOUNDS.latMin - 2, BOUNDS.lonMin - 2], [BOUNDS.latMax + 2, BOUNDS.lonMax + 2]] })
      .setView(value ? [value.lat, value.lon] : [31.1, 73.2], value ? 10 : 7);
    L.tileLayer(IMAGERY, { maxZoom: 17, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(m);
    L.tileLayer(LABELS, { maxZoom: 17, opacity: 0.85 }).addTo(m);
    for (const p of points) {
      L.circleMarker([p.lat, p.lon], { radius: 7, color: "#fffcf5", weight: 2, fillColor: "#c8962e", fillOpacity: 1 })
        .bindTooltip(p.label, { direction: "top", offset: [0, -6] })
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onPointClick?.(p.id);
        })
        .addTo(m);
    }
    m.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lng < BOUNDS.lonMin || lng > BOUNDS.lonMax) return;
      pick.current(Math.round(lat * 100) / 100, Math.round(lng * 100) / 100);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.circleMarker([value.lat, value.lon], { radius: 10, color: "#fffcf5", weight: 3, fillColor: "#a24e2d", fillOpacity: 1 }).addTo(m);
    } else marker.current.setLatLng([value.lat, value.lon]);
  }, [value]);

  return <div ref={el} style={{ height, direction: "ltr" }} className="w-full overflow-hidden rounded-xl border hairline bg-beige-200" />;
}
