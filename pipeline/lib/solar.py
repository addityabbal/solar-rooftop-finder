"""Solar maths: footprint area -> usable area -> kW -> units -> rupees -> payback.

Pure functions. Every constant comes from data/config.json or data/tariffs.json.
"""
from __future__ import annotations

import math

from . import config, tariffs


def usable_area(footprint_m2: float, cfg: dict | None = None) -> float:
    cfg = cfg or config()
    factor = cfg["usable_factor_small"] if footprint_m2 < cfg["small_footprint_m2"] else cfg["usable_factor"]
    return footprint_m2 * factor


def system_kw(usable_m2: float, cfg: dict | None = None) -> float:
    """Roof space per kW, rounded DOWN to the nearest step (0.5 kW)."""
    cfg = cfg or config()
    step = cfg["kw_step"]
    return math.floor((max(usable_m2, 0) / cfg["m2_per_kw"]) / step + 1e-9) * step


def yearly_units(kw: float, sunlight_kwh_m2_day: float, cfg: dict | None = None) -> float:
    cfg = cfg or config()
    return kw * sunlight_kwh_m2_day * 365 * cfg["performance_ratio"]


def tariff(building_type: str, state: str | None, table: dict | None = None) -> float:
    table = table or tariffs()
    category = "residential" if building_type == "residential" else "commercial"
    return table["states"].get(state or "", {}).get(category, table["default"][category])


def subsidy(kw: float, building_type: str, cfg: dict | None = None) -> float:
    cfg = cfg or config()
    rules = cfg["subsidy"]
    if building_type not in rules["applies_to"]:
        return 0.0
    total, lower = 0.0, 0.0
    for slab in rules["slabs"]:
        total += max(min(kw, slab["up_to_kw"]) - lower, 0) * slab["inr_per_kw"]
        lower = slab["up_to_kw"]
    return float(min(total, rules["cap_inr"]))


def payback_years(kw: float, yearly_saving: float, sub: float, cfg: dict | None = None) -> float | None:
    cfg = cfg or config()
    if yearly_saving <= 0:
        return None
    return (kw * cfg["cost_per_kw_inr"] - sub) / yearly_saving


def roof_economics(
    footprint_m2: float,
    building_type: str,
    sunlight_kwh_m2_day: float,
    state: str | None,
    cfg: dict | None = None,
    table: dict | None = None,
) -> dict:
    cfg = cfg or config()
    usable = usable_area(footprint_m2, cfg)
    kw = system_kw(usable, cfg)
    units = yearly_units(kw, sunlight_kwh_m2_day, cfg)
    rate = tariff(building_type, state, table)
    saving = units * rate
    sub = subsidy(kw, building_type, cfg)
    pay = payback_years(kw, saving, sub, cfg)
    return {
        "usable_m2": round(usable, 1),
        "kw": kw,
        "kwh_year": round(units),
        "tariff": rate,
        "saving_year": round(saving),
        "system_cost": round(kw * cfg["cost_per_kw_inr"]),
        "subsidy": round(sub),
        "payback_years": round(pay, 1) if pay is not None else None,
    }
