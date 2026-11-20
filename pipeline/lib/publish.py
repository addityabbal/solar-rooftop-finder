"""Write a pincode result to Cloudflare KV and its build status to D1.

Two transports:
- REST API with CF_API_TOKEN + CF_ACCOUNT_ID (GitHub Actions). KV_NAMESPACE_ID and
  D1_DATABASE_ID name the targets.
- `wrangler` CLI with your own login (laptop seeding): pass via="wrangler".
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import tomllib
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
API = "https://api.cloudflare.com/client/v4/accounts/{account}"


def kv_key(pin: str) -> str:
    return f"pin:{pin}"


class Publisher:
    def __init__(self, via: str = "rest") -> None:
        self.via = via
        self.account = os.environ.get("CF_ACCOUNT_ID", "").strip()
        self.token = os.environ.get("CF_API_TOKEN", "").strip()
        self.kv_id = os.environ.get("KV_NAMESPACE_ID", "").strip()
        self.d1_id = os.environ.get("D1_DATABASE_ID", "").strip()
        if via == "wrangler":
            cfg = tomllib.loads((ROOT / "wrangler.toml").read_text(encoding="utf-8"))
            self.kv_id = self.kv_id or cfg["kv_namespaces"][0]["id"]
        if via == "rest" and not all([self.account, self.token, self.kv_id, self.d1_id]):
            raise RuntimeError("Set CF_ACCOUNT_ID, CF_API_TOKEN, KV_NAMESPACE_ID and D1_DATABASE_ID to publish.")

    # ------------------------------------------------------------ helpers
    def _rest(self, method: str, path: str, **kwargs) -> dict:
        response = requests.request(
            method,
            API.format(account=self.account) + path,
            headers={"Authorization": f"Bearer {self.token}"},
            timeout=60,
            **kwargs,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"Cloudflare API {response.status_code}: {response.text[:300]}")
        return response.json() if response.content else {}

    def _wrangler(self, *args: str) -> None:
        npx = shutil.which("npx") or "npx"
        subprocess.run([npx, "--yes", "wrangler", *args], cwd=ROOT, check=True, capture_output=True)

    # ------------------------------------------------------------ KV
    def put_result(self, pin: str, result: dict) -> None:
        body = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
        if self.via == "wrangler":
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
                handle.write(body)
            try:
                self._wrangler("kv", "key", "put", kv_key(pin), "--path", handle.name, "--namespace-id", self.kv_id, "--remote")
            finally:
                os.unlink(handle.name)
            return
        self._rest("PUT", f"/storage/kv/namespaces/{self.kv_id}/values/{kv_key(pin)}", data=body.encode("utf-8"))

    # ------------------------------------------------------------ D1
    def set_status(self, pin: str, status: str, error: str | None = None) -> None:
        sql = (
            "INSERT INTO build_requests(pin, status, updated_at, error) VALUES(?1, ?2, datetime('now'), ?3) "
            "ON CONFLICT(pin) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, error = excluded.error"
        )
        params = [pin, status, (error or "")[:500] or None]
        if self.via == "wrangler":
            literal = sql.replace("?1", f"'{pin}'").replace("?2", f"'{status}'").replace(
                "?3", "NULL" if not params[2] else "'" + params[2].replace("'", "''") + "'"
            )
            self._wrangler("d1", "execute", "solar-db", "--remote", "--command", literal)
            return
        self._rest("POST", f"/d1/database/{self.d1_id}/query", json={"sql": sql, "params": params})
