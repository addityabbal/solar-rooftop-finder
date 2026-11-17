"""Run the whole pipeline for one pincode and store the result.

CLI:  python -m worker.run_scan 380015 [--force]
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from . import savings
from .boundary import get_boundary
from .enrich import enrich_feature
from .footprints import query_footprints
from .google_client import GoogleClient
from .pincode import validate_pincode
from .settings import savings_config
from .store import get_store, now


def score_and_rank(rows: list[dict]) -> list[dict]:
    """Step 6: apply the savings model and rank by yearly saving."""
    for row in rows:
        row.update(
            savings.estimate(
                row["usable_area_m2"], row["building_type"], row.get("state"), row.get("sunshine_hours")
            )
        )
    rows.sort(key=lambda r: r["saving_per_year"], reverse=True)
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return rows


def run_scan(pincode: str, force: bool = False, store=None, client: GoogleClient | None = None, log=print) -> dict:
    pincode = validate_pincode(pincode)
    store = store or get_store()

    existing = store.get_scan(pincode)
    if existing and existing.get("status") == "completed" and not force:
        log(f"{pincode}: already scanned, returning the stored result (zero API calls).")
        return existing

    cfg = savings_config()
    client = client or GoogleClient.from_env(solar_budget=cfg["shortlist_size"])
    if client is None:
        log("GOOGLE_SERVER_KEY not set: usable area will be estimated and rows carry no address or business match.")
    started = time.time()
    try:
        store.set_status(pincode, "running", progress="Finding the pincode boundary", error=None)
        boundary = get_boundary(pincode, client)
        log(f"{pincode}: boundary from {boundary['source']}")

        store.set_status(pincode, "running", progress="Reading building footprints")
        found = query_footprints(boundary)
        features = found["features"]
        log(f"{pincode}: {found['buildings_in_boundary']} buildings, shortlisted {len(features)}")

        events: list[dict] = []

        def event(row: dict, kind: str, **meta) -> None:
            events.append({"pincode": pincode, "roof_id": row["id"], "type": kind, "source": "worker",
                           "created_at": now(), "meta": meta})

        scanned_at = now()
        rows = []
        for index, feature in enumerate(features, start=1):
            if index == 1 or index % 10 == 0:
                store.set_status(pincode, "running", progress=f"Checking roof {index} of {len(features)}")
            row = enrich_feature(feature, client)
            events.append({"pincode": pincode, "roof_id": row["id"], "type": "scanned", "source": "worker",
                           "created_at": scanned_at, "meta": {"footprint_m2": row["footprint_area_m2"]}})
            event(row, "solar_ready", usable_m2=row["usable_area_m2"], estimated=row["estimated"])
            rows.append(row)

        rows = score_and_rank(rows)
        for row in rows:
            event(row, "economics_calculated", kw=row["kw"], saving_per_year=row["saving_per_year"])
        scan_fields = {
            "progress": None,
            "boundary": boundary["geometry"],
            "boundary_source": boundary["source"],
            "approximate": boundary["approximate"],
            "buildings_in_boundary": found["buildings_in_boundary"],
            "rooftop_count": len(rows),
            "cost": client.cost() if client else {"calls": {}, "usd": 0},
            "duration_seconds": round(time.time() - started),
        }
        store.save_completed(pincode, scan_fields, rows)
        for row in rows:
            event(row, "microsite_live")
        store.replace_worker_events(pincode, events)
        log(f"{pincode}: stored {len(rows)} rooftops in {store.name}. Cost: {json.dumps(scan_fields['cost'])}")
        return store.get_scan(pincode)
    except Exception as error:
        store.set_status(pincode, "failed", progress=None, error=str(error)[:500])
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan one pincode end to end.")
    parser.add_argument("pincode")
    parser.add_argument("--force", action="store_true", help="Re-scan even if a stored result exists.")
    args = parser.parse_args(argv)
    run_scan(args.pincode, force=args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
