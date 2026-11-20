"""Lead score 0-100 and ranking. Weights and ranges live in data/config.json."""
from __future__ import annotations

from . import config


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def norm(value: float, low: float, high: float) -> float:
    return clamp((value - low) / (high - low))


def lead_score(roof: dict, sunlight: float, cfg: dict | None = None) -> float:
    cfg = cfg or config()
    w, r = cfg["score_weights"], cfg["score_ranges"]
    payback = roof.get("payback_years")
    payback_part = clamp(1 - payback / r["payback_years_max"]) if payback is not None else 0.0
    score = (
        w["area"] * norm(roof["usable_m2"], *r["usable_area_m2"])
        + w["sunlight"] * norm(sunlight, *r["sunlight_kwh_m2_day"])
        + w["public_contact"] * (1 if roof.get("phone") or roof.get("website") else 0)
        + w["commercial"] * (1 if roof["type"] == "commercial" else 0)
        + w["payback"] * payback_part
    )
    return round(score, 1)


def rank(roofs: list[dict], sunlight: float, cfg: dict | None = None) -> list[dict]:
    """Score every roof, keep the top N (by score, then yearly saving), number them."""
    cfg = cfg or config()
    for roof in roofs:
        roof["score"] = lead_score(roof, sunlight, cfg)
    roofs.sort(key=lambda r: (r["score"], r["saving_year"]), reverse=True)
    kept = roofs[: cfg["top_n"]]
    for index, roof in enumerate(kept, start=1):
        roof["rank"] = index
    return kept
