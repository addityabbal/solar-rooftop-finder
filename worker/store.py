"""Where scans live: Supabase when configured, else JSON files in web/data/scans."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .settings import LOCAL_SCAN_DIR, env

ROOFTOP_COLUMNS = [
    "id", "geometry", "centroid_lat", "centroid_lng", "footprint_area_m2", "roof_area_m2",
    "usable_area_m2", "estimated", "imagery_quality", "sunshine_hours", "address", "state",
    "building_type", "place_id", "place_distance_m", "kw", "units_per_year", "saving_per_year",
    "saving_low", "saving_high", "system_cost", "subsidy", "net_cost", "payback_years", "rank", "panels",
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def to_ewkt(geometry: dict) -> str:
    def ring(points) -> str:
        return "(" + ",".join(f"{x} {y}" for x, y, *_ in points) + ")"

    def polygon(rings) -> str:
        return "(" + ",".join(ring(r) for r in rings) + ")"

    if geometry["type"] == "Polygon":
        return "SRID=4326;POLYGON" + polygon(geometry["coordinates"])
    if geometry["type"] == "MultiPolygon":
        return "SRID=4326;MULTIPOLYGON(" + ",".join(polygon(p) for p in geometry["coordinates"]) + ")"
    raise ValueError(f"Unsupported geometry type {geometry['type']}")


class LocalStore:
    """One JSON file per pincode. The web app reads the same files."""

    name = "local files (web/data/scans)"

    def __init__(self, directory: Path = LOCAL_SCAN_DIR) -> None:
        self.directory = Path(directory)

    def _path(self, pincode: str) -> Path:
        return self.directory / f"{pincode}.json"

    def get_scan(self, pincode: str) -> dict | None:
        path = self._path(pincode)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def set_status(self, pincode: str, status: str, **fields) -> None:
        scan = self.get_scan(pincode) or {"pincode": pincode, "created_at": now(), "rooftops": []}
        scan.update(status=status, updated_at=now(), **fields)
        self._write(pincode, scan)

    def save_completed(self, pincode: str, scan_fields: dict, rooftops: list[dict]) -> None:
        scan = self.get_scan(pincode) or {"pincode": pincode, "created_at": now()}
        scan.update(scan_fields, status="completed", error=None, updated_at=now(), completed_at=now())
        scan["rooftops"] = [{k: r.get(k) for k in ROOFTOP_COLUMNS} for r in rooftops]
        self._write(pincode, scan)

    def replace_worker_events(self, pincode: str, events: list[dict]) -> None:
        """Swap in this scan's pipeline events, keeping events the web app logged."""
        path = self.directory.parent / "campaign" / f"{pincode}.events.json"
        kept = []
        if path.exists():
            kept = [e for e in json.loads(path.read_text(encoding="utf-8")) if e.get("source") != "worker"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(events + kept, ensure_ascii=False), encoding="utf-8")

    def _write(self, pincode: str, scan: dict) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        self._path(pincode).write_text(json.dumps(scan, ensure_ascii=False), encoding="utf-8")


class SupabaseStore:
    """Talks to Supabase's REST API with the service role key (server side only)."""

    name = "Supabase"

    def __init__(self, url: str, service_key: str) -> None:
        self._http = httpx.Client(
            base_url=url.rstrip("/") + "/rest/v1",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            timeout=30,
        )

    def _check(self, response: httpx.Response) -> httpx.Response:
        if response.status_code >= 300:
            raise RuntimeError(f"Supabase error {response.status_code}: {response.text[:300]}")
        return response

    def get_scan(self, pincode: str) -> dict | None:
        rows = self._check(self._http.get("/scans", params={"pincode": f"eq.{pincode}", "select": "*"})).json()
        return rows[0] if rows else None

    def set_status(self, pincode: str, status: str, **fields) -> None:
        body = {"pincode": pincode, "status": status, "updated_at": now(), **fields}
        self._check(
            self._http.post(
                "/scans",
                params={"on_conflict": "pincode"},
                headers={"Prefer": "resolution=merge-duplicates"},
                json=body,
            )
        )

    def save_completed(self, pincode: str, scan_fields: dict, rooftops: list[dict]) -> None:
        self._check(self._http.delete("/rooftops", params={"pincode": f"eq.{pincode}"}))
        rows = []
        for r in rooftops:
            row = {k: r.get(k) for k in ROOFTOP_COLUMNS}
            row["pincode"] = pincode
            row["geom"] = to_ewkt(r["geometry"])
            rows.append(row)
        if rows:
            self._check(self._http.post("/rooftops", json=rows))
        # Mark completed last, so public readers never see a half-written scan.
        self.set_status(pincode, "completed", error=None, completed_at=now(), **scan_fields)

    def replace_worker_events(self, pincode: str, events: list[dict]) -> None:
        self._check(self._http.delete("/events", params={"pincode": f"eq.{pincode}", "source": "eq.worker"}))
        if events:
            self._check(self._http.post("/events", json=events))


def get_store() -> LocalStore | SupabaseStore:
    url, key = env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY")
    return SupabaseStore(url, key) if url and key else LocalStore()
