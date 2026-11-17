import { describe, expect, it } from "vitest";
import { formatRoofId, parseRoofId } from "./roofId";
import { drawRoof } from "./roofVisual";
import type { Rooftop } from "./types";

// A 30 m x 20 m rectangle near Ahmedabad.
const dLat = 20 / 111_320;
const dLng = 30 / (111_320 * Math.cos((23 * Math.PI) / 180));
const roof = {
  id: "abcdefabcdef",
  centroid_lat: 23 + dLat / 2,
  centroid_lng: 72.5 + dLng / 2,
  kw: 10,
  geometry: {
    type: "Polygon",
    coordinates: [[[72.5, 23], [72.5 + dLng, 23], [72.5 + dLng, 23 + dLat], [72.5, 23 + dLat], [72.5, 23]]],
  },
} as unknown as Rooftop;

describe("roof ids", () => {
  it("round-trips and rejects bad input", () => {
    expect(parseRoofId(formatRoofId("380015", "abcdefabcdef"))).toEqual({ pincode: "380015", id: "abcdefabcdef" });
    for (const bad of ["380015", "080015-abcdefabcdef", "380015-XYZ", "380015-abcdefabcdef/../x"]) {
      expect(parseRoofId(bad)).toBeNull();
    }
  });
});

describe("roof drawing", () => {
  it("draws an illustrative grid sized to the system", () => {
    const drawing = drawRoof(roof);
    expect(drawing.illustrative).toBe(true);
    expect(drawing.panelCount).toBe(25); // 10 kW at 0.4 kW per panel
    expect(drawing.width).toBeCloseTo(34, 0); // 30 m plus a 2 m border each side
    expect(drawing.height).toBeCloseTo(24, 0);
  });

  it("uses Solar API panel positions when stored", () => {
    const drawing = drawRoof({
      ...roof,
      panels: { width_m: 1, height_m: 2, capacity_w: 400, items: [[roof.centroid_lng, roof.centroid_lat, 180, 1]] },
    });
    expect(drawing.illustrative).toBe(false);
    expect(drawing.panelCount).toBe(1);
  });
});
