"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Geometry, Rooftop } from "@/lib/types";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

interface Props {
  rooftops: Rooftop[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  colorFor: (roof: Rooftop) => string;
}

/** Outer rings and holes of a footprint as lists of [lng, lat]. */
function polygonsOf(geometry: Geometry): number[][][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export default function RoofMap(props: Props) {
  return MAPS_KEY ? <GoogleRoofMap {...props} apiKey={MAPS_KEY} /> : <OutlineRoofMap {...props} />;
}

// ---------------------------------------------------------------- Google map

let mapsLoading: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps?.Map) return Promise.resolve();
  if (!mapsLoading) {
    mapsLoading = new Promise((resolve, reject) => {
      const callback = "__solarMapsReady";
      (window as unknown as Record<string, unknown>)[callback] = () => resolve();
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${callback}`;
      script.async = true;
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(script);
    });
  }
  return mapsLoading;
}

function GoogleRoofMap({ rooftops, selectedId, onSelect, colorFor, apiKey }: Props & { apiKey: string }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const shapes = useRef(new Map<string, google.maps.Polygon[]>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !element.current) return;
        map.current = new google.maps.Map(element.current, {
          center: { lat: 22.5, lng: 79 },
          zoom: 5,
          mapTypeId: "hybrid",
          streetViewControl: false,
          fullscreenControl: false,
        });
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Draw one polygon per roof.
  useEffect(() => {
    if (!ready || !map.current) return;
    const drawn = shapes.current;
    drawn.forEach((list) => list.forEach((shape) => shape.setMap(null)));
    drawn.clear();
    const bounds = new google.maps.LatLngBounds();
    for (const roof of rooftops) {
      const list = polygonsOf(roof.geometry).map((rings) => {
        const paths = rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
        paths[0].forEach((point) => bounds.extend(point));
        const shape = new google.maps.Polygon({
          map: map.current,
          paths,
          fillColor: colorFor(roof),
          fillOpacity: 0.85,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
        });
        shape.addListener("click", () => onSelect(roof.id));
        return shape;
      });
      drawn.set(roof.id, list);
    }
    if (!bounds.isEmpty()) map.current.fitBounds(bounds, 32);
  }, [ready, rooftops, colorFor, onSelect]);

  // Highlight and zoom to the selected roof.
  useEffect(() => {
    if (!ready || !map.current) return;
    shapes.current.forEach((list, id) =>
      list.forEach((shape) =>
        shape.setOptions(
          id === selectedId
            ? { strokeColor: "#38bdf8", strokeWeight: 4, zIndex: 2 }
            : { strokeColor: "#ffffff", strokeWeight: 1.5, zIndex: 1 },
        ),
      ),
    );
    const roof = rooftops.find((r) => r.id === selectedId);
    if (roof) {
      const bounds = new google.maps.LatLngBounds();
      polygonsOf(roof.geometry).forEach((rings) => rings[0].forEach(([lng, lat]) => bounds.extend({ lat, lng })));
      map.current.fitBounds(bounds, 120);
    }
  }, [ready, selectedId, rooftops]);

  if (failed) return <OutlineRoofMap rooftops={rooftops} selectedId={selectedId} onSelect={onSelect} colorFor={colorFor} />;
  return <div ref={element} className="h-full w-full" role="application" aria-label="Map of rooftops" />;
}

// ------------------------------------------------- Outline map (no Google key)

const METRES_PER_DEGREE = 111_320;

function OutlineRoofMap({ rooftops, selectedId, onSelect, colorFor }: Props) {
  const view = useMemo(() => {
    if (rooftops.length === 0) return null;
    const lat0 = rooftops.reduce((sum, r) => sum + r.centroid_lat, 0) / rooftops.length;
    const lng0 = rooftops.reduce((sum, r) => sum + r.centroid_lng, 0) / rooftops.length;
    const scaleX = METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
    const project = ([lng, lat]: number[]) => [(lng - lng0) * scaleX, -(lat - lat0) * METRES_PER_DEGREE];
    const roofs = rooftops.map((roof) => {
      const rings = polygonsOf(roof.geometry).flat().map((ring) => ring.map(project));
      const path = rings.map((ring) => "M" + ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");
      const xs = rings.flat().map((p) => p[0]);
      const ys = rings.flat().map((p) => p[1]);
      const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      return { roof, path, box, centre: project([roof.centroid_lng, roof.centroid_lat]) };
    });
    return { roofs };
  }, [rooftops]);

  if (!view) {
    return <div className="grid h-full place-items-center text-sm text-slate-500">No rooftops match the filters.</div>;
  }

  const focus = view.roofs.find((item) => item.roof.id === selectedId);
  const boxes = focus ? [focus.box] : view.roofs.map((item) => item.box);
  const pad = focus ? 120 : 250;
  const minX = Math.min(...boxes.map((b) => b[0])) - pad;
  const minY = Math.min(...boxes.map((b) => b[1])) - pad;
  const width = Math.max(...boxes.map((b) => b[2])) + pad - minX;
  const height = Math.max(...boxes.map((b) => b[3])) + pad - minY;
  const dot = Math.max(width, height) * 0.012;

  return (
    <div className="relative h-full w-full bg-[#eef1ea]">
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label={`Outline map of ${rooftops.length} rooftops`}
        onClick={() => onSelect(null)}
      >
        {view.roofs.map(({ roof, path, centre }) => {
          const selected = roof.id === selectedId;
          return (
            <g
              key={roof.id}
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(roof.id);
              }}
            >
              <title>{`#${roof.rank} ${roof.address ?? "Rooftop"}`}</title>
              {!focus && <circle cx={centre[0]} cy={centre[1]} r={dot} fill={colorFor(roof)} stroke="#0f1b2d" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              <path
                d={path}
                fill={colorFor(roof)}
                fillRule="evenodd"
                stroke={selected ? "#0369a1" : "#0f1b2d"}
                strokeWidth={selected ? 3 : 1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-2 py-1 text-[11px] text-slate-600">
        Outline view, north up. The Google basemap appears once a Maps key is configured.
      </p>
      {focus && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="absolute right-2 top-2 rounded-lg border border-line bg-white px-3 py-1 text-xs font-medium shadow-sm hover:border-sun"
        >
          Show all roofs
        </button>
      )}
    </div>
  );
}
