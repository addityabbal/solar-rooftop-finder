"""Paths, shared config and environment loading."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
LOCAL_SCAN_DIR = ROOT / "web" / "data" / "scans"


def load_env() -> None:
    """Read KEY=value lines from the repo-root .env without overriding real env vars."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@lru_cache
def savings_config() -> dict:
    return json.loads((CONFIG_DIR / "savings.json").read_text(encoding="utf-8"))


@lru_cache
def pricing_config() -> dict:
    return json.loads((CONFIG_DIR / "pricing.json").read_text(encoding="utf-8"))


load_env()
