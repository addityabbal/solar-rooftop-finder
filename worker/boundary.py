"""Step 2: pincode -> boundary polygon.

Order of preference:
1. A licensed India Post pincode boundary GeoJSON (PINCODE_BOUNDARY_GEOJSON).
2. Google Geocoding viewport rectangle (approximate).
3. Local development only: OpenStreetMap Nominatim rectangle (approximate).
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx

from .google_client import GoogleClient
from .settings import env

_PIN_KEYS = {"pincode", "pin_code", "pin", "postalcode", "postal_code"}


class BoundaryNotFound(RuntimeError):
    pass


def _coords(geometry: dict):
    def walk(node):
        if isinstance(node[0], (int, float)):
            yield node
        else:
            for child in node:
                yield from walk(child)

    return walk(geometry["coordinates"])


def bbox_of(geometry: dict) -> list[float]:
    xs, ys = zip(*((c[0], c[1]) for c in _coords(geometry)))
    return [min(xs), min(ys), max(xs), max(ys)]


def rectangle(xmin: float, ymin: float, xmax: float, ymax: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax], [xmin, ymin]]],
    }


def _result(geometry: dict, approximate: bool, source: str) -> dict:
    return {"geometry": geometry, "bbox": bbox_of(geometry), "approximate": approximate, "source": source}


def from_file(pincode: str, path: str | Path) -> dict | None:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        for key, value in props.items():
            if key.lower() in _PIN_KEYS and str(value).strip() == pincode:
                return _result(feature["geometry"], False, "India Post pincode boundary file")
    return None


def from_google(pincode: str, client: GoogleClient) -> dict | None:
    box = client.geocode_pincode(pincode)
    if not box:
        return None
    return _result(rectangle(*box), True, "Google Geocoding viewport")


def from_nominatim(pincode: str) -> dict | None:
    response = httpx.get(
        "https://nominatim.openstreetmap.org/search",
        params={"postalcode": pincode, "countrycodes": "in", "format": "jsonv2", "limit": 1},
        headers={"User-Agent": "solar-rooftop-finder-dev/0.1"},
        timeout=20,
    )
    response.raise_for_status()
    hits = response.json()
    if not hits:
        return None
    south, north, west, east = (float(v) for v in hits[0]["boundingbox"])
    return _result(rectangle(west, south, east, north), True, "OpenStreetMap Nominatim rectangle (development fallback)")


def get_boundary(pincode: str, client: GoogleClient | None = None) -> dict:
    path = env("PINCODE_BOUNDARY_GEOJSON")
    if path and Path(path).exists():
        found = from_file(pincode, path)
        if found:
            return found
    if client is not None:
        found = from_google(pincode, client)
        if found:
            return found
    elif env("ALLOW_NOMINATIM_FALLBACK", "1") != "0":
        found = from_nominatim(pincode)
        if found:
            return found
    raise BoundaryNotFound(
        f"No boundary found for pincode {pincode}. Set PINCODE_BOUNDARY_GEOJSON or GOOGLE_SERVER_KEY."
    )
