"""Build the rooftop result for one pincode.

    python pipeline/build_pincode.py 411014 --out out.json
    python pipeline/build_pincode.py 411014 --publish              # REST (GitHub Actions)
    python pipeline/build_pincode.py 411014 --publish --via wrangler  # your own wrangler login
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shapely import STRtree, points  # noqa: E402
from shapely import from_geojson  # noqa: E402

from lib import config  # noqa: E402
from lib import address, ai_summary, geo, overture, scoring, solar, sunlight  # noqa: E402

# Fields published per roof (keeps each KV value small). The app builds the address from
# road + the pincode-level locality, district and state.
ROOF_FIELDS = [
    "rank", "score", "type", "lat", "lon", "area_sqft", "usable_sqft", "kw", "kwh_year", "saving_year",
    "subsidy", "payback_years", "name", "phone", "website", "road", "plus_code", "source", "rings",
]
COMMERCIAL_SUBTYPES = {"commercial", "industrial", "retail", "service", "agricultural"}
INSTITUTIONAL_SUBTYPES = {"civic", "education", "medical", "religious", "military", "transportation", "entertainment"}


def classify(subtype: str | None, has_place: bool) -> str:
    if subtype in INSTITUTIONAL_SUBTYPES:
        return "institutional"
    if subtype in COMMERCIAL_SUBTYPES or has_place:
        return "commercial"
    return "residential"


def indian(n: float) -> str:
    """12,34,567 grouping, as installers read it."""
    s = f"{round(n):d}"
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def build(pin: str, log=print) -> dict:
    cfg = config()
    started = time.time()
    loc = geo.locate(pin, cfg)
    log(f"{pin}: centre {loc['lat']}, {loc['lon']} from {loc['source']}")
    sun, sun_source = sunlight.daily_sunlight(loc["lat"], loc["lon"])
    log(f"{pin}: sunlight {sun} kWh/m²/day ({sun_source})")

    con = overture.connect()
    blds = overture.buildings(con, loc["bbox"])
    plcs = overture.places(con, loc["bbox"])
    rds = overture.roads(con, loc["bbox"])
    log(f"{pin}: {len(blds)} buildings, {len(plcs)} places, {len(rds)} named road segments")

    # Point-in-polygon: which public listing sits inside which building.
    footprints = [from_geojson(b["geojson"]) for b in blds]
    tree = STRtree(footprints)
    best_place: dict[int, dict] = {}
    if plcs:
        pts = points([(p["lon"], p["lat"]) for p in plcs])
        place_idx, bld_idx = tree.query(pts, predicate="within")
        for pi, bi in zip(place_idx, bld_idx):
            place = plcs[pi]
            current = best_place.get(bi)
            rank = (bool(place["phone"] or place["website"]), place["confidence"])
            if current is None or rank > (bool(current["phone"] or current["website"]), current["confidence"]):
                best_place[bi] = place

    roads = address.RoadIndex(rds, loc["lat"])
    where = {"pin": pin, "locality": loc["locality"], "district": loc["district"], "state": loc["state"]}

    roofs = []
    for i, b in enumerate(blds):
        place = best_place.get(i)
        kind = classify(b["subtype"], place is not None)
        econ = solar.roof_economics(b["area_m2"], kind, sun, loc["state"])
        if econ["kw"] <= 0:
            continue
        public = place if (place and kind != "residential") else None
        roofs.append({
            "id": b["id"],
            "type": kind,
            "subtype": b["subtype"],
            "lat": round(b["lat"], 6),
            "lon": round(b["lon"], 6),
            "footprint_m2": round(b["area_m2"], 1),
            "floors": b["num_floors"],
            "source": b["source"],
            **econ,
            "name": public["name"] if public else None,
            "category": public["category"] if public else None,
            "phone": public["phone"] if public else None,
            "website": public["website"] if public else None,
            "_geojson": b["geojson"],
        })

    eligible = len(roofs)
    all_roofs = list(roofs)
    kept = scoring.rank(roofs, sun, cfg)
    for roof in kept:
        road, metres = roads.nearest(roof["lat"], roof["lon"])
        roof["road"] = road
        roof["plus_code"] = address.plus_code(roof["lat"], roof["lon"])
        roof["address"] = address.format_address(road, where)
        roof["area_sqft"] = round(roof["footprint_m2"] * cfg["sqft_per_m2"])
        roof["usable_sqft"] = round(roof["usable_m2"] * cfg["sqft_per_m2"])
        roof["rings"] = overture.geometry_ring(roof.pop("_geojson"), decimals=5)

    usable_total_m2 = sum(r["usable_m2"] for r in all_roofs)
    paybacks = [r["payback_years"] for r in all_roofs if r["payback_years"] is not None]
    share = cfg["adoption_share_for_headline"]
    commercial = [r for r in kept if r["type"] == "commercial"]
    stats = {
        "buildings_scanned": len(blds),
        "eligible_roofs": eligible,
        "roofs_listed": len(kept),
        "usable_sqft_total": round(usable_total_m2 * cfg["sqft_per_m2"]),
        "potential_mw": round(sum(r["kw"] for r in all_roofs) / 1000, 1),
        "saving_year_if_adopted_inr": round(sum(r["saving_year"] for r in all_roofs) * share),
        "adoption_share": share,
        "median_payback_years": round(statistics.median(paybacks), 1) if paybacks else None,
        "commercial_roofs": sum(1 for r in all_roofs if r["type"] == "commercial"),
        "roofs_with_public_contact": sum(1 for r in kept if r["phone"] or r["website"]),
    }

    tariff_res = solar.tariff("residential", loc["state"])
    tariff_com = solar.tariff("commercial", loc["state"])
    result = {
        "pin": pin,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "build_seconds": round(time.time() - started),
        "overture_release": cfg["overture_release"],
        "centre": {"lat": loc["lat"], "lon": loc["lon"], "source": loc["source"]},
        "bbox": {k: round(v, 6) for k, v in loc["bbox"].items()},
        "locality": loc["locality"],
        "district": loc["district"],
        "state": loc["state"],
        "sunlight": {"kwh_m2_day": sun, "source": sun_source},
        "tariff": {"residential": tariff_res, "commercial": tariff_com, "approximate": True},
        "stats": stats,
        "assumptions": {k: cfg[k] for k in (
            "bbox_half_km", "min_footprint_m2", "usable_factor", "usable_factor_small", "small_footprint_m2",
            "m2_per_kw", "kw_step", "performance_ratio", "cost_per_kw_inr", "subsidy", "score_weights", "top_n",
        )},
        "roofs": [{k: r[k] for k in ROOF_FIELDS} for r in kept],
    }
    result["summary"] = ai_summary.summarise(summary_input(result))
    log_summary(result, log)
    return result


def summary_input(result: dict) -> dict:
    """The only data the AI sees. Built from the published result, so a summary can be redone later."""
    stats = result["stats"]
    commercial = [r for r in result["roofs"] if r["type"] == "commercial"]
    return {
        "pincode": result["pin"],
        "place": ", ".join(p for p in [result["locality"], result["district"], result["state"]] if p),
        "state": result["state"],
        "buildings": stats["buildings_scanned"],
        "usable_sqft_total": indian(stats["usable_sqft_total"]),
        "potential_mw": stats["potential_mw"],
        "median_payback_years": stats["median_payback_years"],
        "sunlight_kwh_m2_day": result["sunlight"]["kwh_m2_day"],
        "tariff_inr_per_kwh": {"residential": result["tariff"]["residential"], "commercial": result["tariff"]["commercial"]},
        "commercial_roofs": stats["commercial_roofs"],
        "roofs_with_public_contact": stats["roofs_with_public_contact"],
        "top_10_commercial": [
            {"name": r["name"] or "unnamed building", "kw": r["kw"], "saving_inr_per_year": indian(r["saving_year"])}
            for r in commercial[:10]
        ],
    }


def log_summary(result: dict, log=print) -> None:
    s = result["summary"]
    log(f"{result['pin']}: summary from {s['source']}" + (f" ({'; '.join(s['notes'])})" if s["notes"] else ""))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pin")
    parser.add_argument("--out", help="Write the result JSON to this file.")
    parser.add_argument("--publish", action="store_true", help="Write to Cloudflare KV and update D1 status.")
    parser.add_argument("--via", choices=["rest", "wrangler"], default="rest")
    parser.add_argument("--resummarise", metavar="RESULT_JSON", help="Redo only the AI summary of an existing result file.")
    args = parser.parse_args(argv)

    if args.resummarise:
        result = json.loads(Path(args.resummarise).read_text(encoding="utf-8"))
        result["summary"] = ai_summary.summarise(summary_input(result))
        log_summary(result)
        Path(args.out or args.resummarise).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        if args.publish:
            from lib.publish import Publisher

            Publisher(args.via).put_result(args.pin, result)
            print(f"{args.pin}: republished to KV")
        return 0

    publisher = None
    if args.publish:
        from lib.publish import Publisher

        publisher = Publisher(args.via)
        publisher.set_status(args.pin, "running")
    try:
        result = build(args.pin)
    except Exception as error:
        if publisher:
            publisher.set_status(args.pin, "failed", str(error))
        raise
    body = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    print(f"{args.pin}: {len(result['roofs'])} roofs, {len(body.encode()) / 1024:.0f} KB, {result['build_seconds']} s")
    if args.out:
        Path(args.out).write_text(body, encoding="utf-8")
    if publisher:
        publisher.put_result(args.pin, result)
        publisher.set_status(args.pin, "done")
        print(f"{args.pin}: published to KV")
    return 0


if __name__ == "__main__":
    sys.exit(main())
