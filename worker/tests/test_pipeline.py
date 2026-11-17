"""Offline tests: a tiny local GeoParquet stands in for Open Buildings, and a fake
transport stands in for Google."""
import json

import duckdb
import httpx
import pytest

from worker import run_scan as run_scan_module
from worker.boundary import bbox_of, from_file, rectangle
from worker.enrich import classify, enrich_feature
from worker.footprints import query_footprints, utm_epsg
from worker.google_client import BudgetExceeded, GoogleClient
from worker.store import LocalStore, to_ewkt

# Squares near Ahmedabad: (lng, lat, side in metres)
BUILDINGS = [
    (72.5200, 23.0200, 30),  # 900 m2, inside
    (72.5210, 23.0210, 10),  # 100 m2, inside
    (72.5220, 23.0220, 5),   # 25 m2, inside but under the 40 m2 floor
    (72.6000, 23.1000, 40),  # outside the boundary
]
BOUNDARY = {"geometry": rectangle(72.51, 23.01, 72.53, 23.03), "bbox": [72.51, 23.01, 72.53, 23.03],
            "approximate": True, "source": "test"}


def square_wkt(lng, lat, side_m):
    dlat = side_m / 110_750
    dlng = side_m / 102_500  # metres per degree of longitude at about 23 N
    return (f"POLYGON(({lng} {lat},{lng + dlng} {lat},{lng + dlng} {lat + dlat},"
            f"{lng} {lat + dlat},{lng} {lat}))")


@pytest.fixture
def parquet(tmp_path):
    path = (tmp_path / "buildings.parquet").as_posix()
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    values = ",".join(f"('{square_wkt(*b)}')" for b in BUILDINGS)
    con.execute(
        f"""
        COPY (
          SELECT 'google' AS bf_source, 0.9 AS confidence, ST_GeomFromText(wkt) AS geometry,
                 {{'xmin': ST_XMin(ST_GeomFromText(wkt)), 'ymin': ST_YMin(ST_GeomFromText(wkt)),
                   'xmax': ST_XMax(ST_GeomFromText(wkt)), 'ymax': ST_YMax(ST_GeomFromText(wkt))}} AS bbox
          FROM (VALUES {values}) t(wkt)
        ) TO '{path}' (FORMAT PARQUET)
        """
    )
    con.close()
    return path


def test_utm_zone():
    assert utm_epsg(72.5, 23.0) == "EPSG:32643"
    assert utm_epsg(88.3, 22.5) == "EPSG:32645"


def test_footprints_clip_filter_and_rank(parquet):
    result = query_footprints(BOUNDARY, source=parquet)
    assert result["buildings_in_boundary"] == 3
    areas = [f["properties"]["footprint_area_m2"] for f in result["features"]]
    assert len(areas) == 2
    assert areas[0] == pytest.approx(900, rel=0.03)
    assert areas[1] == pytest.approx(100, rel=0.03)


def test_boundary_file_lookup(tmp_path):
    path = tmp_path / "pins.geojson"
    path.write_text(json.dumps({"features": [
        {"properties": {"Pincode": "380015"}, "geometry": rectangle(72.5, 23.0, 72.6, 23.1)}]}))
    found = from_file("380015", path)
    assert found["approximate"] is False and found["bbox"] == [72.5, 23.0, 72.6, 23.1]
    assert from_file("110001", path) is None
    assert bbox_of(rectangle(1, 2, 3, 4)) == [1, 2, 3, 4]


def test_classify():
    assert classify(None) == "residential"
    assert classify({"types": ["store"], "primary_type": "store"}) == "commercial"
    assert classify({"types": ["school", "point_of_interest"]}) == "institutional"
    assert classify({"types": ["route"]}) == "residential"


def test_ewkt():
    assert to_ewkt(rectangle(0, 0, 1, 1)) == "SRID=4326;POLYGON((0 0,1 0,1 1,0 1,0 0))"


def fake_google(solar_status=200):
    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == "solar.googleapis.com":
            if solar_status == 404:
                return httpx.Response(404, json={"error": {"status": "NOT_FOUND"}})
            return httpx.Response(200, json={"imageryQuality": "BASE", "solarPotential": {
                "wholeRoofStats": {"areaMeters2": 850.0}, "maxArrayAreaMeters2": 600.0,
                "maxSunshineHoursPerYear": 1900,
                "panelWidthMeters": 1.045, "panelHeightMeters": 1.879, "panelCapacityWatts": 400,
                "roofSegmentStats": [{"azimuthDegrees": 180}],
                "solarPanels": [{"center": {"latitude": 23.0201, "longitude": 72.5201},
                                 "orientation": "PORTRAIT", "segmentIndex": 0}]}})
        if host == "maps.googleapis.com":
            return httpx.Response(200, json={"results": [{
                "formatted_address": "12 Test Road, Ahmedabad, Gujarat 380015, India",
                "address_components": [
                    {"long_name": "380015", "types": ["postal_code"]},
                    {"long_name": "Gujarat", "types": ["administrative_area_level_1"]}]}]})
        if host == "places.googleapis.com":
            assert request.headers["X-Goog-FieldMask"].startswith("places.id")
            return httpx.Response(200, json={"places": [{
                "id": "PLACE123", "types": ["store"], "primaryType": "store",
                "location": {"latitude": 23.02001, "longitude": 72.52001}}]})
        raise AssertionError(f"unexpected host {host}")

    return httpx.MockTransport(handler)


def test_enrich_with_solar_data(parquet):
    client = GoogleClient("k", transport=fake_google(), backoff=0)
    feature = query_footprints(BOUNDARY, source=parquet)["features"][0]
    row = enrich_feature(feature, client)
    assert row["usable_area_m2"] == 600.0 and row["estimated"] is False
    assert row["panels"]["items"] == [[72.5201, 23.0201, 180, 1]] and row["panels"]["width_m"] == 1.045
    assert row["state"] == "Gujarat" and row["building_type"] == "commercial"
    assert row["place_id"] == "PLACE123" and row["place_distance_m"] < 30
    assert client.cost()["calls"] == {"solar_building_insights": 1, "geocoding": 1, "places_nearby": 1}


def test_solar_404_falls_back_to_half_footprint(parquet):
    client = GoogleClient("k", transport=fake_google(solar_status=404), backoff=0)
    feature = query_footprints(BOUNDARY, source=parquet)["features"][0]
    row = enrich_feature(feature, client)
    assert row["estimated"] is True
    assert row["usable_area_m2"] == pytest.approx(feature["properties"]["footprint_area_m2"] * 0.5, abs=0.1)


def test_solar_budget_stops_calls():
    client = GoogleClient("k", solar_budget=1, transport=fake_google(), backoff=0)
    client.building_insights(23.0, 72.5)
    with pytest.raises(BudgetExceeded):
        client.building_insights(23.0, 72.5)


def test_retry_then_fail():
    client = GoogleClient("k", transport=httpx.MockTransport(lambda r: httpx.Response(503)), backoff=0)
    with pytest.raises(RuntimeError, match="after 3 attempts"):
        client.reverse_geocode(23.0, 72.5)


def test_run_scan_end_to_end_and_cached_rerun(parquet, tmp_path, monkeypatch):
    monkeypatch.setattr(run_scan_module, "get_boundary", lambda pincode, client: BOUNDARY)
    real_query = run_scan_module.query_footprints
    monkeypatch.setattr(run_scan_module, "query_footprints", lambda boundary: real_query(boundary, source=parquet))
    store = LocalStore(tmp_path / "scans")
    client = GoogleClient("k", transport=fake_google(), backoff=0)

    scan = run_scan_module.run_scan("380015", store=store, client=client, log=lambda *_: None)
    assert scan["status"] == "completed" and scan["rooftop_count"] == 2
    top = scan["rooftops"][0]
    assert top["rank"] == 1 and top["kw"] == 60 and top["subsidy"] == 0
    assert top["units_per_year"] == 60 * 1900 * 0.75
    assert scan["cost"]["calls"]["solar_building_insights"] == 2

    events = json.loads((tmp_path / "campaign" / "380015.events.json").read_text())
    assert [e["type"] for e in events if e["roof_id"] == top["id"]] == [
        "scanned", "solar_ready", "economics_calculated", "microsite_live"]

    calls_before = dict(client.calls)
    again = run_scan_module.run_scan("380015", store=store, client=client, log=lambda *_: None)
    assert again["status"] == "completed" and client.calls == calls_before
