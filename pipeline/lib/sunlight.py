"""Average daily sunlight (kWh/m²/day) from the NASA POWER climatology API. Free, no key."""
from __future__ import annotations

import requests

from . import config

URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"


def daily_sunlight(lat: float, lon: float) -> tuple[float, str]:
    """Returns (kWh/m²/day, source). Falls back to the config default if NASA is unreachable."""
    try:
        response = requests.get(
            URL,
            params={
                "parameters": "ALLSKY_SFC_SW_DWN",
                "community": "RE",
                "latitude": f"{lat:.4f}",
                "longitude": f"{lon:.4f}",
                "format": "JSON",
            },
            timeout=60,
        )
        response.raise_for_status()
        value = response.json()["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"]
        if value and value > 0:
            return round(float(value), 2), "NASA POWER climatology (ALLSKY_SFC_SW_DWN, annual)"
    except (requests.RequestException, KeyError, ValueError, TypeError):
        pass
    return config()["default_sunlight_kwh_m2_day"], "Default (NASA POWER unavailable)"
