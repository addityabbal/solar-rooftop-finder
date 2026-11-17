"""Savings model. Pure functions; every number comes from config/savings.json.

Mirrors web/lib/savings.ts. Change both together.
"""
from __future__ import annotations

from .settings import savings_config

RESIDENTIAL = "residential"


def system_kw(usable_area_m2: float, building_type: str, cfg: dict | None = None) -> float:
    cfg = cfg or savings_config()
    step = cfg["kw_rounding_step"]
    raw = max(usable_area_m2, 0) / cfg["area_per_kw_m2"]
    # Round half up to the nearest step (panels come in whole units).
    kw = int(raw / step + 0.5) * step
    if building_type == RESIDENTIAL:
        kw = min(kw, cfg["residential_cap_kw"])
    return round(kw, 2)


def yield_per_kw(sunshine_hours: float | None, cfg: dict | None = None) -> float:
    cfg = cfg or savings_config()
    if sunshine_hours and sunshine_hours > 0:
        return sunshine_hours * cfg["sunshine_performance_ratio"]
    return cfg["default_yield_kwh_per_kw"]


def tariff(building_type: str, state: str | None, cfg: dict | None = None) -> float:
    cfg = cfg or savings_config()
    category = "residential" if building_type == RESIDENTIAL else "commercial"
    table = cfg["tariff_inr_per_unit"]
    by_state = table["by_state"].get(state or "", {})
    return by_state.get(category, table["default"][category])


def subsidy(kw: float, building_type: str, state: str | None, cfg: dict | None = None) -> float:
    cfg = cfg or savings_config()
    rules = cfg["subsidy"]
    if building_type not in rules["applies_to"]:
        return 0.0
    scheme = rules["special_category"] if state in rules["special_category_states"] else rules["general"]
    total, lower = 0.0, 0.0
    for slab in scheme["slabs"]:
        upper = slab["up_to_kw"]
        total += max(min(kw, upper) - lower, 0) * slab["inr_per_kw"]
        lower = upper
    return float(min(total, scheme["cap_inr"]))


def estimate(
    usable_area_m2: float,
    building_type: str,
    state: str | None = None,
    sunshine_hours: float | None = None,
    cfg: dict | None = None,
) -> dict:
    cfg = cfg or savings_config()
    kw = system_kw(usable_area_m2, building_type, cfg)
    units = kw * yield_per_kw(sunshine_hours, cfg)
    saving = units * tariff(building_type, state, cfg)
    cost = kw * cfg["cost_per_kw_inr"]
    sub = subsidy(kw, building_type, state, cfg)
    net = cost - sub
    spread = cfg["range_fraction"]
    return {
        "kw": kw,
        "units_per_year": round(units),
        "saving_per_year": round(saving),
        "saving_low": round(saving * (1 - spread)),
        "saving_high": round(saving * (1 + spread)),
        "system_cost": round(cost),
        "subsidy": round(sub),
        "net_cost": round(net),
        "payback_years": round(net / saving, 1) if saving > 0 else None,
    }
