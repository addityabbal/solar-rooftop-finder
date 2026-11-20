"""One-time: turn the Department of Posts pincode directory into pipeline/data/pincode_centroids.csv.

Usage:  python pipeline/tools/make_centroids.py <path to directory CSV>

Input columns: OfficeName, Pincode, OfficeType, District, StateName, Latitude, Longitude.
Each pincode gets the median position of its post offices (robust to a few bad rows),
its main office name as the locality, and its district and state.
"""
from __future__ import annotations

import csv
import statistics
import sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "pincode_centroids.csv"
# Rough India bounding box; rows outside it are typos (swapped or missing coordinates).
LAT_RANGE, LON_RANGE = (6.0, 37.5), (68.0, 97.5)
OFFICE_RANK = {"HO": 0, "PO": 1, "SO": 1, "BO": 2}


def clean_office(name: str) -> str:
    for suffix in (" B.O", " S.O", " H.O", " BO", " SO", " HO"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name.strip()


def main(source: str) -> None:
    offices: dict[str, list[dict]] = defaultdict(list)
    with open(source, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            pin = row["Pincode"].strip()
            if len(pin) != 6 or not pin.isdigit() or pin[0] == "0":
                continue
            try:
                lat, lon = float(row["Latitude"]), float(row["Longitude"])
            except ValueError:
                continue
            if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LON_RANGE[0] <= lon <= LON_RANGE[1]):
                continue
            offices[pin].append({**row, "lat": lat, "lon": lon})

    rows = []
    for pin in sorted(offices):
        items = offices[pin]
        lat = statistics.median(o["lat"] for o in items)
        lon = statistics.median(o["lon"] for o in items)
        main_office = min(items, key=lambda o: OFFICE_RANK.get(o["OfficeType"].strip().upper(), 3))
        rows.append({
            "pincode": pin,
            "lat": f"{lat:.5f}",
            "lon": f"{lon:.5f}",
            "locality": clean_office(main_office["OfficeName"]).title(),
            "district": main_office["District"].strip().title(),
            "state": main_office["StateName"].strip().title(),
            "offices": len(items),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} pincodes to pipeline/data/{OUT.name}")


if __name__ == "__main__":
    main(sys.argv[1])
