"""Steps 1-4: pincode -> boundary -> building footprints -> top 50 by area.

CLI:  python -m worker.footprints 380015 [--out file.geojson]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time

import duckdb

from .boundary import get_boundary
from .google_client import GoogleClient
from .pincode import validate_pincode
from .settings import savings_config

# VIDA Google-Microsoft-OSM Open Buildings, India, ODbL. One 64 GB GeoParquet file with a
# bbox column, so DuckDB reads only the row groups that overlap our rectangle.
OPEN_BUILDINGS_URL = (
    "https://data.source.coop/vida/google-microsoft-osm-open-buildings/"
    "geoparquet/by_country/country_iso=IND/IND.parquet"
)


def utm_epsg(lng: float, lat: float) -> str:
    zone = int((lng + 180) // 6) + 1
    return f"EPSG:{(32600 if lat >= 0 else 32700) + zone}"


def roof_id(lat: float, lng: float) -> str:
    return hashlib.sha1(f"{lat:.6f},{lng:.6f}".encode()).hexdigest()[:12]


def query_footprints(
    boundary: dict,
    source: str = OPEN_BUILDINGS_URL,
    min_area_m2: float | None = None,
    limit: int | None = None,
) -> dict:
    """Return {'features': [...], 'buildings_in_boundary': n} for the boundary polygon."""
    cfg = savings_config()
    min_area_m2 = cfg["min_footprint_m2"] if min_area_m2 is None else min_area_m2
    limit = cfg["shortlist_size"] if limit is None else limit
    xmin, ymin, xmax, ymax = boundary["bbox"]
    projection = utm_epsg((xmin + xmax) / 2, (ymin + ymax) / 2)

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    if source.startswith("http"):
        con.execute("INSTALL httpfs; LOAD httpfs;")
    escaped = source.replace("'", "''")
    # Pass 1: bbox pushdown. Only overlapping row groups are downloaded.
    con.execute(
        f"""
        CREATE TEMP TABLE candidates AS
        SELECT ST_AsWKB(geometry) AS wkb, bf_source, confidence
        FROM read_parquet('{escaped}')
        WHERE bbox.xmax >= ? AND bbox.xmin <= ? AND bbox.ymax >= ? AND bbox.ymin <= ?
        """,
        [xmin, xmax, ymin, ymax],
    )
    # Pass 2: clip to the polygon and measure area in a metric (UTM) projection.
    con.execute(
        """
        CREATE TEMP TABLE clipped AS
        SELECT g.geom, g.bf_source, g.confidence,
               ST_Area(ST_Transform(g.geom, 'EPSG:4326', ?, always_xy := true)) AS area_m2
        FROM (SELECT ST_GeomFromWKB(wkb) AS geom, bf_source, confidence FROM candidates) g
        WHERE ST_Within(ST_Centroid(g.geom), ST_GeomFromGeoJSON(?))
        """,
        [projection, json.dumps(boundary["geometry"])],
    )
    total = con.execute("SELECT count(*) FROM clipped").fetchone()[0]
    rows = con.execute(
        """
        SELECT ST_AsGeoJSON(geom), ST_X(ST_Centroid(geom)), ST_Y(ST_Centroid(geom)),
               area_m2, bf_source, confidence
        FROM clipped WHERE area_m2 >= ? ORDER BY area_m2 DESC LIMIT ?
        """,
        [min_area_m2, limit],
    ).fetchall()
    con.close()

    features = []
    for geojson, lng, lat, area, bf_source, confidence in rows:
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(geojson),
                "properties": {
                    "id": roof_id(lat, lng),
                    "centroid_lat": round(lat, 6),
                    "centroid_lng": round(lng, 6),
                    "footprint_area_m2": round(area, 1),
                    "footprint_source": bf_source,
                    "footprint_confidence": confidence,
                },
            }
        )
    return {"features": features, "buildings_in_boundary": total}


def footprints_for_pincode(pincode: str, client: GoogleClient | None = None) -> dict:
    pincode = validate_pincode(pincode)
    boundary = get_boundary(pincode, client)
    result = query_footprints(boundary)
    return {
        "type": "FeatureCollection",
        "pincode": pincode,
        "approximate": boundary["approximate"],
        "boundary_source": boundary["source"],
        "boundary": boundary["geometry"],
        "buildings_in_boundary": result["buildings_in_boundary"],
        "features": result["features"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Top building footprints for an Indian pincode.")
    parser.add_argument("pincode")
    parser.add_argument("--out", help="Write GeoJSON here instead of printing a summary only.")
    args = parser.parse_args(argv)

    started = time.time()
    collection = footprints_for_pincode(args.pincode, GoogleClient.from_env())
    seconds = time.time() - started
    features = collection["features"]
    print(f"Pincode {collection['pincode']}: {collection['buildings_in_boundary']} buildings in boundary, "
          f"kept top {len(features)} in {seconds:.0f}s")
    print(f"Boundary: {collection['boundary_source']} (approximate={collection['approximate']})")
    for feature in features[:5]:
        p = feature["properties"]
        print(f"  {p['id']}  {p['footprint_area_m2']:>9.1f} m2  {p['centroid_lat']}, {p['centroid_lng']}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(collection, handle)
        print(f"Wrote {args.out} (drop it into geojson.io to check)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
