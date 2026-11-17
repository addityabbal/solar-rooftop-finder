import { ImageResponse } from "next/og";

export const alt = "Solar Rooftop Lead Finder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0f1b2d",
          color: "#faf8f3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, color: "#f9c66a" }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: "#e8890c" }} />
          Solar Rooftop Lead Finder
        </div>
        <div style={{ marginTop: 28, fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
          Find the rooftops worth a site visit.
        </div>
        <div style={{ marginTop: 28, fontSize: 34, color: "#cbd5e1" }}>
          One Indian pincode in. Ranked roofs, yearly saving and payback out.
        </div>
      </div>
    ),
    size,
  );
}
