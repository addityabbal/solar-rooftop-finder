"""Approximate address without any geocoding API: nearest named road + locality + Plus Code."""
from __future__ import annotations

import math

from openlocationcode import openlocationcode as olc
from shapely import STRtree, from_wkb
from shapely.affinity import scale
from shapely.geometry import Point

MAX_ROAD_DISTANCE_M = 150
METRES_PER_DEG = 111_320


class RoadIndex:
    """Nearest named road to a point, measured in metres (longitude scaled by latitude)."""

    def __init__(self, roads: list[dict], lat0: float) -> None:
        self.kx = math.cos(math.radians(lat0))
        self.names = [r["name"] for r in roads]
        self.geoms = [scale(from_wkb(r["wkb"]), xfact=self.kx, yfact=1, origin=(0, 0)) for r in roads]
        self.tree = STRtree(self.geoms) if self.geoms else None

    def nearest(self, lat: float, lon: float) -> tuple[str | None, float | None]:
        if self.tree is None:
            return None, None
        point = Point(lon * self.kx, lat)
        index = self.tree.nearest(point)
        metres = self.geoms[index].distance(point) * METRES_PER_DEG
        return (self.names[index], round(metres)) if metres <= MAX_ROAD_DISTANCE_M else (None, None)


def plus_code(lat: float, lon: float) -> str:
    return olc.encode(lat, lon, 10)


def format_address(road: str | None, place: dict) -> str:
    parts = [f"Near {road}" if road else None, place.get("locality"), place.get("district")]
    tail = " ".join(p for p in [place.get("state"), place.get("pin")] if p)
    return ", ".join([p for p in parts if p] + ([tail] if tail else []))


def maps_link(lat: float, lon: float) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={lat:.6f},{lon:.6f}"
