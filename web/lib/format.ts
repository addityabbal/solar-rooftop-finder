import { SQFT_PER_M2 } from "./savings";
import type { BuildingType } from "./types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const formatInr = (value: number) => inr.format(value);
export const formatNumber = (value: number) => number.format(value);
export const toSqft = (m2: number) => Math.round(m2 * SQFT_PER_M2);

/** Short rupee amounts for cards and chips: ₹4.2 L, ₹1.3 Cr. */
export function formatInrShort(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(value >= 1e8 ? 0 : 1)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(value >= 1e6 ? 0 : 1)} L`;
  return inr.format(value);
}

export const TYPE_LABEL: Record<BuildingType, string> = {
  commercial: "Commercial",
  institutional: "Institutional",
  residential: "Residential",
  unclassified: "Unclassified",
};
