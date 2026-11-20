"""DuckDB queries against Overture Maps on public S3: buildings, places, road segments.

Only the row groups whose bounding boxes overlap our search box are downloaded. The
Overture release is pinned in data/config.json so a rebuild gives the same answer.
"""
from __future__ import annotations

import json

import duckdb

from . import config

S3 = "s3://overturemaps-us-west-2/release/{release}/theme={theme}/type={type}/*"


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")
    # Overture stores longitude, latitude (x, y). Say so explicitly; DuckDB 2.x warns otherwise.
    try:
        con.execute("SET geometry_always_xy = true;")
    except duckdb.Error:
        pass
    return con


def _source(theme: str, kind: str, release: str) -> str:
    return f"read_parquet('{S3.format(release=release, theme=theme, type=kind)}', hive_partitioning=1)"


def _inside(box: dict) -> str:
    return (
        f"bbox.xmin > {box['west']:.6f} AND bbox.xmax < {box['east']:.6f} "
        f"AND bbox.ymin > {box['south']:.6f} AND bbox.ymax < {box['north']:.6f}"
    )


def buildings(con, box: dict, release: str | None = None, min_area_m2: float | None = None) -> list[dict]:
    cfg = config()
    release = release or cfg["overture_release"]
    min_area_m2 = cfg["min_footprint_m2"] if min_area_m2 is None else min_area_m2
    rows = con.execute(
        f"""
        WITH b AS (
          SELECT id, geometry, subtype, class, num_floors,
                 sources[1].dataset AS source,
                 ST_Area_Spheroid(geometry) AS area_m2
          FROM {_source('buildings', 'building', release)}
          WHERE {_inside(box)}
        )
        SELECT id, area_m2, ST_Y(ST_Centroid(geometry)), ST_X(ST_Centroid(geometry)),
               num_floors, subtype, class, source, ST_AsGeoJSON(geometry)
        FROM b WHERE area_m2 >= ?
        """,
        [min_area_m2],
    ).fetchall()
    keys = ["id", "area_m2", "lat", "lon", "num_floors", "subtype", "class", "source", "geojson"]
    return [dict(zip(keys, row)) for row in rows]


def places(con, box: dict, release: str | None = None) -> list[dict]:
    release = release or config()["overture_release"]
    rows = con.execute(
        f"""
        SELECT id, names.primary, basic_category, phones, websites, confidence,
               ST_Y(geometry), ST_X(geometry)
        FROM {_source('places', 'place', release)}
        WHERE {_inside(box)} AND COALESCE(operating_status, 'open') = 'open'
        """
    ).fetchall()
    out = []
    for pid, name, category, phones, websites, confidence, lat, lon in rows:
        out.append({
            "id": pid,
            "name": name,
            "category": category,
            "phone": (phones or [None])[0],
            "website": (websites or [None])[0],
            "confidence": confidence or 0,
            "lat": lat,
            "lon": lon,
        })
    return out


def roads(con, box: dict, release: str | None = None) -> list[dict]:
    """Named road segments only (an unnamed segment is no help in an address)."""
    release = release or config()["overture_release"]
    rows = con.execute(
        f"""
        SELECT names.primary, class, ST_AsWKB(geometry)
        FROM {_source('transportation', 'segment', release)}
        WHERE {_inside(box)} AND subtype = 'road' AND names.primary IS NOT NULL
        """
    ).fetchall()
    return [{"name": name, "class": cls, "wkb": bytes(wkb)} for name, cls, wkb in rows]


def geometry_ring(geojson: str, decimals: int = 6) -> list:
    """Outer ring(s) of a footprint as compact [[lon, lat], ...] lists for the map."""
    geom = json.loads(geojson)
    polygons = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return [[[round(x, decimals), round(y, decimals)] for x, y, *_ in poly[0]] for poly in polygons]
