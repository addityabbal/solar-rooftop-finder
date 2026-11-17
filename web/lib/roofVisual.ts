/**
 * Our own roof diagram: the footprint outline plus a panel layout, in metres.
 * Drawn from the footprint polygon and (when present) Solar API panel positions.
 * No imagery is used. Pure functions, shared by the SVG component and the postcard PDF.
 */
import config from "../../config/savings.json";
import type { Rooftop } from "./types";

type Point = [number, number];

export interface RoofDrawing {
  width: number;
  height: number;
  /** SVG path of the roof outline; y grows downward. */
  outline: string;
  /** SVG path holding every panel rectangle. */
  panels: string;
  panelCount: number;
  /** True when positions are our own grid, not Solar API's. */
  illustrative: boolean;
}

const MAX_PANELS_DRAWN = 3000;
const METRES_PER_DEGREE = 111_320;

function rotate([x, y]: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

function inside(point: Point, rings: Point[][]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

const pathOf = (points: Point[]) => "M" + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z";

export function drawRoof(roof: Rooftop): RoofDrawing {
  const lat0 = roof.centroid_lat;
  const lng0 = roof.centroid_lng;
  const scaleX = METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const project = (lng: number, lat: number): Point => [(lng - lng0) * scaleX, -(lat - lat0) * METRES_PER_DEGREE];

  const polygons = roof.geometry.type === "Polygon" ? [roof.geometry.coordinates] : roof.geometry.coordinates;
  let rings: Point[][] = polygons.flat().map((ring) => ring.map(([lng, lat]) => project(lng, lat)));

  // Turn the building so its longest wall is horizontal: a tidier diagram and an easy grid.
  let longest = 0;
  let angle = 0;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const dx = ring[i][0] - ring[i - 1][0];
      const dy = ring[i][1] - ring[i - 1][1];
      const length = Math.hypot(dx, dy);
      if (length > longest) {
        longest = length;
        angle = Math.atan2(dy, dx);
      }
    }
  }
  rings = rings.map((ring) => ring.map((p) => rotate(p, -angle)));

  const quads: Point[][] = [];
  const stored = roof.panels?.items?.length ? roof.panels : null;
  if (stored) {
    const w = stored.width_m ?? config.panel.width_m;
    const h = stored.height_m ?? config.panel.height_m;
    for (const [lng, lat, azimuth, portrait] of stored.items.slice(0, MAX_PANELS_DRAWN)) {
      const centre = project(lng, lat);
      const [hw, hh] = portrait ? [w / 2, h / 2] : [h / 2, w / 2];
      const turn = (azimuth * Math.PI) / 180;
      quads.push(
        ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as Point[]).map((corner) => {
          const [x, y] = rotate(corner, turn);
          return rotate([centre[0] + x, centre[1] + y], -angle);
        }),
      );
    }
  } else {
    const { width_m: w, height_m: h, kw, gap_m: gap, edge_margin_m: margin } = config.panel;
    const target = Math.min(Math.round(roof.kw / kw), MAX_PANELS_DRAWN);
    const xs = rings.flat().map((p) => p[0]);
    const ys = rings.flat().map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let y = minY + margin; y + h <= maxY - margin && quads.length < target; y += h + gap * 3) {
      for (let x = minX + margin; x + w <= maxX - margin && quads.length < target; x += w + gap) {
        // Keep the panel only if it, plus the edge margin, sits fully on the roof.
        const probes: Point[] = [
          [x - margin, y - margin], [x + w + margin, y - margin],
          [x + w + margin, y + h + margin], [x - margin, y + h + margin], [x + w / 2, y + h / 2],
        ];
        if (probes.every((p) => inside(p, rings))) quads.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
      }
    }
  }

  // Shift everything so the drawing starts at 0,0 with a small border.
  const all = rings.flat();
  const pad = 2;
  const offX = Math.min(...all.map((p) => p[0])) - pad;
  const offY = Math.min(...all.map((p) => p[1])) - pad;
  const shift = (points: Point[]) => points.map(([x, y]) => [x - offX, y - offY] as Point);
  return {
    width: Math.max(...all.map((p) => p[0])) - offX + pad,
    height: Math.max(...all.map((p) => p[1])) - offY + pad,
    outline: rings.map((ring) => pathOf(shift(ring))).join(""),
    panels: quads.map((quad) => pathOf(shift(quad))).join(""),
    panelCount: quads.length,
    illustrative: !stored,
  };
}
