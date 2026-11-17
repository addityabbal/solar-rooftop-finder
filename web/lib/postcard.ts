/** Server only. Print-ready 6x4 inch postcard PDF for one roof: front (diagram, numbers, QR) and back (address). */
import "server-only";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { toSqft } from "./format";
import { drawRoof } from "./roofVisual";
import type { Rooftop } from "./types";

const W = 432; // 6 in at 72 pt per inch
const H = 288; // 4 in
const INK = rgb(0.06, 0.11, 0.18);
const MUTED = rgb(0.38, 0.42, 0.48);
const SUN = rgb(0.91, 0.54, 0.05);

// The built-in PDF fonts have no rupee sign, so amounts print as "Rs".
const rupees = (value: number) => `Rs ${Math.round(value).toLocaleString("en-IN")}`;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Keep to characters the built-in fonts can print.
const printable = (text: string) => text.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();

function drawQr(page: PDFPage, url: string, x: number, top: number, size: number) {
  const code = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = code.modules.size;
  const cell = size / count;
  page.drawRectangle({ x: x - 4, y: H - top - size - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) });
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.modules.data[row * count + col]) {
        page.drawRectangle({ x: x + col * cell, y: H - top - (row + 1) * cell, width: cell + 0.2, height: cell + 0.2, color: INK });
      }
    }
  }
}

export async function buildPostcard(options: {
  roof: Rooftop;
  qrUrl: string;
  installer: string | null;
}): Promise<Uint8Array> {
  const { roof, qrUrl, installer } = options;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Solar postcard, roof ${roof.id}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (page: PDFPage, value: string, x: number, top: number, size: number, font = regular, color = INK) =>
    page.drawText(value, { x, y: H - top - size, size, font, color });

  // ---- Front
  const front = pdf.addPage([W, H]);
  front.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.98, 0.97, 0.95) });
  front.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: SUN });

  const drawing = drawRoof(roof);
  const box = { x: 20, top: 28, width: 190, height: 150 };
  front.drawRectangle({ x: box.x, y: H - box.top - box.height, width: box.width, height: box.height, color: rgb(0.93, 0.95, 0.92) });
  const scale = Math.min((box.width - 16) / drawing.width, (box.height - 16) / drawing.height);
  const origin = {
    x: box.x + (box.width - drawing.width * scale) / 2,
    y: H - box.top - (box.height - drawing.height * scale) / 2,
  };
  front.drawSvgPath(drawing.outline, { ...origin, scale, color: rgb(0.84, 0.83, 0.8), borderColor: INK, borderWidth: 0.8 });
  if (drawing.panels) front.drawSvgPath(drawing.panels, { ...origin, scale, color: rgb(0.11, 0.23, 0.43) });
  text(front, `Your roof with ${drawing.panelCount.toLocaleString("en-IN")} solar panels${drawing.illustrative ? " (illustrative)" : ""}`, box.x, box.top + box.height + 5, 6.5, regular, MUTED);

  text(front, "Your roof could", 228, 30, 17, bold);
  text(front, "pay you back.", 228, 50, 17, bold);
  const facts: [string, string][] = [
    [rupees(roof.saving_per_year), "saved per year"],
    [`${roof.kw} kW`, `system on ${toSqft(roof.usable_area_m2).toLocaleString("en-IN")} sq ft`],
    [roof.payback_years === null ? "n/a" : `${roof.payback_years.toFixed(1)} years`, "to pay for itself"],
  ];
  facts.forEach(([value, label], index) => {
    const top = 82 + index * 33;
    text(front, value, 228, top, 15, bold, SUN);
    text(front, label, 228, top + 17, 8, regular, MUTED);
  });

  drawQr(front, qrUrl, 338, 196, 72);
  text(front, "Scan to see your", 228, 208, 9, bold);
  text(front, "roof's numbers", 228, 220, 9, bold);
  text(front, "and book a free", 228, 234, 9);
  text(front, "site visit.", 228, 246, 9);
  text(front, "Estimate, not a quotation. Savings may be 15% lower or higher.", 20, 262, 6.5, regular, MUTED);
  text(front, installer ? `Site visits by ${printable(installer)}` : "DEMONSTRATION CARD - not for posting", 20, 272, 6.5, bold, installer ? MUTED : SUN);

  // ---- Back
  const back = pdf.addPage([W, H]);
  back.drawLine({ start: { x: 216, y: 24 }, end: { x: 216, y: H - 24 }, thickness: 0.5, color: MUTED });
  text(back, "How we worked this out", 20, 28, 10, bold);
  const story =
    `We measured this roof from open building-outline data: about ${toSqft(roof.roof_area_m2).toLocaleString("en-IN")} sq ft, ` +
    `of which ${toSqft(roof.usable_area_m2).toLocaleString("en-IN")} sq ft could carry panels. ` +
    `A ${roof.kw} kW system would make about ${roof.units_per_year.toLocaleString("en-IN")} units a year. ` +
    `It would cost about ${rupees(roof.system_cost)}` +
    (roof.subsidy > 0 ? `, less ${rupees(roof.subsidy)} subsidy.` : ".") +
    " We do not know who lives or works here and hold no personal details about you.";
  wrap(story, regular, 8, 176).forEach((line, index) => text(back, line, 20, 46 + index * 11, 8));
  text(back, printable(qrUrl), 20, 250, 6.5, regular, MUTED);

  back.drawRectangle({ x: 362, y: H - 74, width: 46, height: 50, borderColor: MUTED, borderWidth: 0.5 });
  text(back, "STAMP", 372, 46, 7, regular, MUTED);
  text(back, "To", 236, 110, 8, regular, MUTED);
  text(back, "The Owner", 236, 124, 12, bold);
  const address = roof.address
    ? printable(roof.address)
    : `Roof near ${roof.centroid_lat.toFixed(5)}, ${roof.centroid_lng.toFixed(5)} (no postal address on file)`;
  wrap(address, regular, 10, 172).slice(0, 6).forEach((line, index) => text(back, line, 236, 142 + index * 13, 10));

  return pdf.save();
}
