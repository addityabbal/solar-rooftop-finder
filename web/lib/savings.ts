/**
 * Savings model. Pure functions; every number comes from config/savings.json.
 * Mirrors worker/savings.py. Change both together.
 */
import defaultConfig from "../../config/savings.json";

export type SavingsConfig = typeof defaultConfig & {
  tariff_inr_per_unit: {
    default: { residential: number; commercial: number };
    by_state: Record<string, { residential?: number; commercial?: number }>;
  };
};

export interface Estimate {
  kw: number;
  units_per_year: number;
  saving_per_year: number;
  saving_low: number;
  saving_high: number;
  system_cost: number;
  subsidy: number;
  net_cost: number;
  payback_years: number | null;
}

const config = defaultConfig as SavingsConfig;
export const SQFT_PER_M2 = config.sqft_per_m2;

export function systemKw(usableAreaM2: number, buildingType: string, cfg: SavingsConfig = config): number {
  const step = cfg.kw_rounding_step;
  const raw = Math.max(usableAreaM2, 0) / cfg.area_per_kw_m2;
  let kw = Math.floor(raw / step + 0.5) * step;
  if (buildingType === "residential") kw = Math.min(kw, cfg.residential_cap_kw);
  return Math.round(kw * 100) / 100;
}

export function yieldPerKw(sunshineHours: number | null | undefined, cfg: SavingsConfig = config): number {
  return sunshineHours && sunshineHours > 0
    ? sunshineHours * cfg.sunshine_performance_ratio
    : cfg.default_yield_kwh_per_kw;
}

export function tariff(buildingType: string, state: string | null | undefined, cfg: SavingsConfig = config): number {
  const category = buildingType === "residential" ? "residential" : "commercial";
  const table = cfg.tariff_inr_per_unit;
  return table.by_state[state ?? ""]?.[category] ?? table.default[category];
}

export function subsidy(
  kw: number,
  buildingType: string,
  state: string | null | undefined,
  cfg: SavingsConfig = config,
): number {
  const rules = cfg.subsidy;
  if (!rules.applies_to.includes(buildingType)) return 0;
  const scheme = rules.special_category_states.includes(state ?? "") ? rules.special_category : rules.general;
  let total = 0;
  let lower = 0;
  for (const slab of scheme.slabs) {
    total += Math.max(Math.min(kw, slab.up_to_kw) - lower, 0) * slab.inr_per_kw;
    lower = slab.up_to_kw;
  }
  return Math.min(total, scheme.cap_inr);
}

export function estimate(
  usableAreaM2: number,
  buildingType: string,
  state?: string | null,
  sunshineHours?: number | null,
  cfg: SavingsConfig = config,
): Estimate {
  const kw = systemKw(usableAreaM2, buildingType, cfg);
  const units = kw * yieldPerKw(sunshineHours, cfg);
  const saving = units * tariff(buildingType, state, cfg);
  const cost = kw * cfg.cost_per_kw_inr;
  const sub = subsidy(kw, buildingType, state, cfg);
  const net = cost - sub;
  const spread = cfg.range_fraction;
  return {
    kw,
    units_per_year: Math.round(units),
    saving_per_year: Math.round(saving),
    saving_low: Math.round(saving * (1 - spread)),
    saving_high: Math.round(saving * (1 + spread)),
    system_cost: Math.round(cost),
    subsidy: Math.round(sub),
    net_cost: Math.round(net),
    payback_years: saving > 0 ? Math.round((net / saving) * 10) / 10 : null,
  };
}
