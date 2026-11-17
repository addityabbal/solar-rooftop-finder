"""Step 5: enrich each shortlisted footprint with roof, address and business data.

CLI:  python -m worker.enrich 380015 [--limit 10]
"""
from __future__ import annotations

import argparse
import json
import math
import sys

from .footprints import footprints_for_pincode
from .google_client import BudgetExceeded, GoogleClient
from .settings import savings_config

INSTITUTIONAL_TYPES = {
    "school", "primary_school", "secondary_school", "preschool", "university",
    "hospital", "place_of_worship", "hindu_temple", "mosque", "church", "synagogue",
    "local_government_office", "government_office", "city_hall", "courthouse", "embassy",
    "police", "fire_station", "post_office", "library", "museum", "community_center",
}
# Place types that describe an area rather than a business at this building.
IGNORED_TYPES = {"route", "locality", "sublocality", "neighborhood", "political", "premise", "street_address"}


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    k = 111_320.0
    dx = (lng2 - lng1) * k * math.cos(math.radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * k
    return math.hypot(dx, dy)


def classify(place: dict | None) -> str:
    """commercial, institutional or residential, from the nearest public business listing."""
    if not place:
        return "residential"
    types = set(place.get("types") or []) | {place.get("primary_type")}
    types.discard(None)
    if types and types <= IGNORED_TYPES:
        return "residential"
    if types & INSTITUTIONAL_TYPES:
        return "institutional"
    return "commercial"


def enrich_feature(feature: dict, client: GoogleClient | None) -> dict:
    """Return one flat rooftop row (areas in m2). Savings fields are added later."""
    cfg = savings_config()
    p = feature["properties"]
    lat, lng, footprint = p["centroid_lat"], p["centroid_lng"], p["footprint_area_m2"]
    fallback_usable = round(footprint * cfg["fallback_usable_fraction"], 1)
    row = {
        "id": p["id"],
        "geometry": feature["geometry"],
        "centroid_lat": lat,
        "centroid_lng": lng,
        "footprint_area_m2": footprint,
        "roof_area_m2": footprint,
        "usable_area_m2": fallback_usable,
        "estimated": True,
        "imagery_quality": None,
        "sunshine_hours": None,
        "address": None,
        "address_pincode": None,
        "state": None,
        "building_type": "unclassified",
        "place_id": None,
        "place_distance_m": None,
        "panels": None,
    }
    if client is None:
        return row

    try:
        solar = client.building_insights(lat, lng)
    except BudgetExceeded:
        solar = None
        row["budget_stopped"] = True
    if solar and solar.get("usable_area_m2"):
        row.update(
            roof_area_m2=round(solar.get("roof_area_m2") or footprint, 1),
            usable_area_m2=round(solar["usable_area_m2"], 1),
            sunshine_hours=solar.get("sunshine_hours"),
            imagery_quality=solar.get("imagery_quality"),
            panels=solar.get("panels"),
            estimated=False,
        )

    address = client.reverse_geocode(lat, lng)
    row.update(address=address["address"], address_pincode=address["pincode"], state=address["state"])

    place = client.nearby_place(lat, lng, 30.0)
    row["building_type"] = classify(place)
    if place and row["building_type"] != "residential":
        row["place_id"] = place["place_id"]
        if place.get("lat") is not None:
            row["place_distance_m"] = round(distance_m(lat, lng, place["lat"], place["lng"]), 1)
    return row


def enrich_all(features: list[dict], client: GoogleClient | None) -> list[dict]:
    return [enrich_feature(feature, client) for feature in features]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enrich the top footprints of a pincode.")
    parser.add_argument("pincode")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args(argv)

    client = GoogleClient.from_env()
    if client is None:
        print("GOOGLE_SERVER_KEY is not set: rows will use the footprint x 0.5 fallback, with no address or business match.")
    collection = footprints_for_pincode(args.pincode, client)
    rows = enrich_all(collection["features"][: args.limit], client)
    for row in rows:
        row.pop("geometry")
        print(json.dumps(row, ensure_ascii=False))
    if client:
        print("API cost for this run:", json.dumps(client.cost()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
