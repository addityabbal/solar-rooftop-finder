"""Solar Rooftop Finder pipeline library."""
import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


@lru_cache
def config() -> dict:
    return json.loads((DATA_DIR / "config.json").read_text(encoding="utf-8"))


@lru_cache
def tariffs() -> dict:
    return json.loads((DATA_DIR / "tariffs.json").read_text(encoding="utf-8"))
