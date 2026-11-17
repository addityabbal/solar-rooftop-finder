"""The one module that talks to Google. Retry, timeout and a per-scan budget counter.

Endpoints and field masks were written from the public API reference. Before the first
paid run, re-read the current docs and pricing (see README, "Before your first paid scan").
"""
from __future__ import annotations

import time

import httpx

from .settings import env, pricing_config

SOLAR_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
# Narrowest mask that still lets us classify the building. Name, phone and website are
# fetched on view by the web app, never stored here.
PLACES_NEARBY_MASK = "places.id,places.types,places.primaryType,places.location"

_RETRY_STATUS = {429, 500, 502, 503, 504}


class BudgetExceeded(RuntimeError):
    pass


MAX_PANELS_STORED = 2000


def _panel_layout(potential: dict) -> dict | None:
    """Panel positions from Solar API, kept small: size plus [lng, lat, azimuth, portrait] per panel.

    Used only to draw our own roof diagram. No imagery is stored.
    """
    panels = potential.get("solarPanels") or []
    if not panels:
        return None
    segments = potential.get("roofSegmentStats") or []
    items = []
    for panel in panels[:MAX_PANELS_STORED]:
        centre = panel.get("center") or {}
        index = panel.get("segmentIndex", 0)
        azimuth = segments[index].get("azimuthDegrees", 0) if index < len(segments) else 0
        items.append([
            round(centre.get("longitude", 0), 7),
            round(centre.get("latitude", 0), 7),
            round(azimuth or 0),
            1 if panel.get("orientation") == "PORTRAIT" else 0,
        ])
    return {
        "width_m": potential.get("panelWidthMeters"),
        "height_m": potential.get("panelHeightMeters"),
        "capacity_w": potential.get("panelCapacityWatts"),
        "items": items,
    }


class GoogleClient:
    def __init__(
        self,
        api_key: str,
        solar_budget: int = 50,
        timeout: float = 15.0,
        retries: int = 3,
        transport: httpx.BaseTransport | None = None,
        backoff: float = 1.0,
    ) -> None:
        self._key = api_key
        self._http = httpx.Client(timeout=timeout, transport=transport)
        self._retries = retries
        self._backoff = backoff
        self.solar_budget = solar_budget
        self.calls = {"solar_building_insights": 0, "geocoding": 0, "places_nearby": 0}

    @classmethod
    def from_env(cls, solar_budget: int = 50) -> "GoogleClient | None":
        key = env("GOOGLE_SERVER_KEY")
        return cls(key, solar_budget=solar_budget) if key else None

    def close(self) -> None:
        self._http.close()

    # ---- plumbing -------------------------------------------------------
    def _request(self, api: str, method: str, url: str, ok_status=(200,), **kwargs) -> httpx.Response:
        if api == "solar_building_insights" and self.calls[api] >= self.solar_budget:
            raise BudgetExceeded(f"Scan stopped: Solar API budget of {self.solar_budget} calls reached.")
        last_error: Exception | None = None
        for attempt in range(self._retries):
            self.calls[api] += 1
            try:
                response = self._http.request(method, url, **kwargs)
            except httpx.TransportError as error:
                last_error = error
            else:
                if response.status_code in ok_status:
                    return response
                if response.status_code not in _RETRY_STATUS:
                    raise RuntimeError(f"{api} failed with HTTP {response.status_code}: {response.text[:200]}")
                last_error = RuntimeError(f"{api} HTTP {response.status_code}")
            if attempt < self._retries - 1:
                time.sleep(self._backoff * (2**attempt))
        raise RuntimeError(f"{api} failed after {self._retries} attempts: {last_error}")

    def cost(self) -> dict:
        prices = pricing_config()["usd_per_call"]
        usd = None
        if all(prices.get(api) is not None for api in self.calls):
            usd = round(sum(prices[api] * count for api, count in self.calls.items()), 4)
        return {"calls": dict(self.calls), "usd": usd}

    # ---- APIs -----------------------------------------------------------
    def geocode_pincode(self, pincode: str) -> tuple[float, float, float, float] | None:
        """Return (xmin, ymin, xmax, ymax) of the pincode's viewport."""
        response = self._request(
            "geocoding",
            "GET",
            GEOCODE_URL,
            params={"components": f"postal_code:{pincode}|country:IN", "key": self._key},
        )
        results = response.json().get("results") or []
        if not results:
            return None
        geometry = results[0]["geometry"]
        box = geometry.get("bounds") or geometry["viewport"]
        return (box["southwest"]["lng"], box["southwest"]["lat"], box["northeast"]["lng"], box["northeast"]["lat"])

    def reverse_geocode(self, lat: float, lng: float) -> dict:
        response = self._request(
            "geocoding",
            "GET",
            GEOCODE_URL,
            params={"latlng": f"{lat},{lng}", "region": "in", "key": self._key},
        )
        results = response.json().get("results") or []
        if not results:
            return {"address": None, "pincode": None, "state": None}
        best = results[0]
        parts = {t: c["long_name"] for c in best.get("address_components", []) for t in c.get("types", [])}
        return {
            "address": best.get("formatted_address"),
            "pincode": parts.get("postal_code"),
            "state": parts.get("administrative_area_level_1"),
        }

    def building_insights(self, lat: float, lng: float) -> dict | None:
        """Solar API roof data for the building closest to the point. None when Google has no data (404)."""
        params = {
            "location.latitude": f"{lat:.6f}",
            "location.longitude": f"{lng:.6f}",
            "requiredQuality": env("SOLAR_REQUIRED_QUALITY", "BASE"),
            "key": self._key,
        }
        response = self._request("solar_building_insights", "GET", SOLAR_URL, ok_status=(200, 404), params=params)
        if response.status_code == 404:
            return None
        data = response.json()
        potential = data.get("solarPotential") or {}
        return {
            "panels": _panel_layout(potential),
            "roof_area_m2": (potential.get("wholeRoofStats") or {}).get("areaMeters2"),
            "usable_area_m2": potential.get("maxArrayAreaMeters2"),
            "sunshine_hours": potential.get("maxSunshineHoursPerYear"),
            "imagery_quality": data.get("imageryQuality"),
        }

    def nearby_place(self, lat: float, lng: float, radius_m: float = 30.0) -> dict | None:
        """Closest business within the radius, or None. Returns ids and types only."""
        response = self._request(
            "places_nearby",
            "POST",
            PLACES_NEARBY_URL,
            headers={"X-Goog-Api-Key": self._key, "X-Goog-FieldMask": PLACES_NEARBY_MASK},
            json={
                "maxResultCount": 1,
                "rankPreference": "DISTANCE",
                "locationRestriction": {
                    "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}
                },
            },
        )
        places = response.json().get("places") or []
        if not places:
            return None
        place = places[0]
        location = place.get("location") or {}
        return {
            "place_id": place.get("id"),
            "types": place.get("types") or [],
            "primary_type": place.get("primaryType"),
            "lat": location.get("latitude"),
            "lng": location.get("longitude"),
        }
