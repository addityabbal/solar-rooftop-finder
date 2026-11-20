"""Pincode -> centre point and a square search box (± bbox_half_km).

Centres come from the Department of Posts directory (data/pincode_centroids.csv), checked
against one OpenStreetMap Nominatim lookup per build: some directory rows are tens or
hundreds of km off. When the two disagree by more than agree_km, Nominatim wins. Offline,
a neighbour check (pincodes sharing first digits) flags suspicious directory rows.
"""
from __future__ import annotations

import csv
import math
import statistics
from functools import lru_cache

import requests

from . import DATA_DIR, config

KM_PER_DEG_LAT = 111.32


class UnknownPincode(ValueError):
    pass


def is_valid_pincode(pin: str) -> bool:
    return isinstance(pin, str) and len(pin) == 6 and pin.isdigit() and pin[0] != "0"


@lru_cache
def directory() -> dict[str, dict]:
    with open(DATA_DIR / "pincode_centroids.csv", newline="", encoding="utf-8") as handle:
        return {
            row["pincode"]: {**row, "lat": float(row["lat"]), "lon": float(row["lon"])}
            for row in csv.DictReader(handle)
        }


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = a, b
    dx = (lon2 - lon1) * KM_PER_DEG_LAT * math.cos(math.radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * KM_PER_DEG_LAT
    return math.hypot(dx, dy)


def suspicious(pin: str, entry: dict, table: dict[str, dict], cfg: dict) -> bool:
    """True when the centre is far from the other pincodes sharing its first digits."""
    rule = cfg["centroid_check"]
    neighbours: list[tuple[float, float]] = []
    # Closest family first (5 shared digits), wider (4) when that family is too small.
    for digits in (rule["neighbour_prefix_digits"] + 1, rule["neighbour_prefix_digits"]):
        prefix = pin[:digits]
        neighbours = [(e["lat"], e["lon"]) for p, e in table.items() if p.startswith(prefix) and p != pin]
        if len(neighbours) >= 3:
            break
    if len(neighbours) < 3:
        return False
    middle = (statistics.median(n[0] for n in neighbours), statistics.median(n[1] for n in neighbours))
    spread = statistics.median(distance_km(n, middle) for n in neighbours)
    limit = max(rule["min_km"], rule["spread_multiple"] * spread)
    return distance_km((entry["lat"], entry["lon"]), middle) > limit


def nominatim_centre(pin: str) -> tuple[float, float] | None:
    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"postalcode": pin, "countrycodes": "in", "format": "jsonv2", "limit": 1},
        headers={"User-Agent": "solar-rooftop-finder/1.0 (+https://github.com/addityabbal/solar-rooftop-finder)"},
        timeout=20,
    )
    response.raise_for_status()
    hits = response.json()
    return (float(hits[0]["lat"]), float(hits[0]["lon"])) if hits else None


def bbox_around(lat: float, lon: float, half_km: float) -> dict:
    dlat = half_km / KM_PER_DEG_LAT
    dlon = half_km / (KM_PER_DEG_LAT * math.cos(math.radians(lat)))
    return {"west": lon - dlon, "south": lat - dlat, "east": lon + dlon, "north": lat + dlat}


def locate(pin: str, cfg: dict | None = None, lookup=nominatim_centre) -> dict:
    cfg = cfg or config()
    if not is_valid_pincode(pin):
        raise UnknownPincode(f"Not a valid Indian pincode: {pin!r}")
    table = directory()
    entry = table.get(pin)
    try:
        found = lookup(pin)
    except requests.RequestException:
        found = None
    centre, source = None, ""
    if entry and found and distance_km((entry["lat"], entry["lon"]), found) <= cfg["centroid_check"]["agree_km"]:
        centre, source = (entry["lat"], entry["lon"]), "Department of Posts directory (checked against OpenStreetMap)"
    elif found:
        centre = found
        source = "OpenStreetMap Nominatim (directory position disagreed)" if entry else "OpenStreetMap Nominatim"
    elif entry:
        centre = (entry["lat"], entry["lon"])
        source = "Department of Posts directory" + (" (may be off: far from neighbouring pincodes)" if suspicious(pin, entry, table, cfg) else "")
    if centre is None:
        raise UnknownPincode(f"Pincode {pin} is not in the directory and could not be located.")
    return {
        "pin": pin,
        "lat": round(centre[0], 5),
        "lon": round(centre[1], 5),
        "source": source,
        "locality": (entry or {}).get("locality"),
        "district": (entry or {}).get("district"),
        "state": (entry or {}).get("state"),
        "bbox": bbox_around(centre[0], centre[1], cfg["bbox_half_km"]),
    }
