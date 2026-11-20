"""One AI call per pincode: English + Hindi summary and a short installer pitch.

The model only rephrases numbers the pipeline already computed. Guardrails:
1. Output must parse as JSON with en/hi/pitch; retry once, else use a template.
2. Every number in the output must appear in the input (± number_tolerance).
3. Phone-number-like strings are removed, so contacts only ever come from the data.

Transport: Workers AI REST API (CF_API_TOKEN + CF_ACCOUNT_ID), or AI_PROXY_URL (a local
`wrangler dev` proxy, see tools/ai-proxy) for builds on a laptop without an API token.
"""
from __future__ import annotations

import json
import os
import re

import requests

from . import config

SYSTEM = (
    "You write short summaries for solar installers in India.\n"
    "Use ONLY the numbers in the JSON. Copy each number exactly as written there; never invent, "
    "convert, add up or round differently. If a field is missing, say \"not available\".\n"
    "State only facts that are in the JSON. Never claim that any building already has solar panels, "
    "that anyone recommends or endorses solar, or anything about subsidies or prices not given.\n"
    'Return JSON only: {"en": "...", "hi": "...", "pitch": "..."}.\n'
    "en: 3 to 4 plain English sentences, 50 to 80 words, for an installer deciding whether to work this "
    "pincode. Cover the number of buildings, usable roof area in sq ft, potential MW, median payback, "
    "sunlight, and how many commercial roofs have a public phone or website; name two or three of the "
    "top commercial buildings.\n"
    "hi: the same content in natural Hindi (Devanagari script), 50 to 80 words; keep digits as 0-9.\n"
    "pitch: one WhatsApp-length Hinglish message (under 40 words) an installer could send to a business "
    "owner in this pincode. The pitch must not name any business or building. No phone numbers anywhere."
)

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
PHONE = re.compile(r"(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


class AIUnavailable(RuntimeError):
    pass


# ---------------------------------------------------------------- numbers

def numbers_in(text: str) -> list[float]:
    text = text.translate(DEVANAGARI_DIGITS)
    found = []
    for match in NUMBER.findall(text):
        cleaned = match.replace(",", "").rstrip(".")
        try:
            found.append(float(cleaned))
        except ValueError:
            continue
    return found


def allowed_numbers(stats: dict) -> set[float]:
    return set(numbers_in(json.dumps(stats, ensure_ascii=False)))


def unsupported_numbers(text: str, allowed: set[float], tolerance: float) -> list[float]:
    bad = []
    for value in numbers_in(text):
        if not any(abs(value - a) <= max(abs(a) * tolerance, 1e-9) for a in allowed):
            bad.append(value)
    return bad


def strip_phones(text: str) -> str:
    return re.sub(r"\s{2,}", " ", PHONE.sub("", text)).strip()


# ---------------------------------------------------------------- template

def template_summary(stats: dict) -> dict:
    s = stats
    en = (
        f"Pincode {s['pincode']} ({s['place']}) has {s['buildings']} buildings with about "
        f"{s['usable_sqft_total']} sq ft of usable roof, enough for about {s['potential_mw']} MW of solar. "
        f"Average sunlight is {s['sunlight_kwh_m2_day']} kWh per m² a day. "
        f"The median payback is {s['median_payback_years']} years. "
        f"There are {s['commercial_roofs']} commercial roofs, {s['roofs_with_public_contact']} with a public phone or website."
    )
    hi = (
        f"पिनकोड {s['pincode']} ({s['place']}) में {s['buildings']} इमारतें हैं, जिनकी छतों पर लगभग "
        f"{s['usable_sqft_total']} वर्ग फुट जगह सोलर के लिए उपयोगी है, यानी लगभग {s['potential_mw']} मेगावाट। "
        f"यहाँ औसत धूप {s['sunlight_kwh_m2_day']} kWh प्रति वर्ग मीटर प्रतिदिन है। "
        f"लागत औसतन {s['median_payback_years']} साल में वसूल होती है। "
        f"{s['commercial_roofs']} व्यावसायिक छतें हैं, जिनमें से {s['roofs_with_public_contact']} का सार्वजनिक फ़ोन या वेबसाइट उपलब्ध है।"
    )
    pitch = (
        f"Namaste! Aapke area {s['pincode']} mein roof par solar se payback sirf {s['median_payback_years']} saal mein. "
        f"Free site visit ke liye reply kijiye."
    )
    return {"en": en, "hi": hi, "pitch": pitch}


# ---------------------------------------------------------------- model call

def _call_model(stats: dict, model: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": json.dumps(stats, ensure_ascii=False)},
    ]
    body = {"messages": messages, "max_tokens": 900, "temperature": 0.2}
    proxy = os.environ.get("AI_PROXY_URL", "").strip()
    token, account = os.environ.get("CF_API_TOKEN", "").strip(), os.environ.get("CF_ACCOUNT_ID", "").strip()
    if proxy:
        response = requests.post(proxy, json={"model": model, **body}, timeout=120)
    elif token and account:
        response = requests.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
            timeout=120,
        )
    else:
        raise AIUnavailable("No CF_API_TOKEN/CF_ACCOUNT_ID or AI_PROXY_URL set.")
    response.raise_for_status()
    data = response.json()
    result = data.get("result", data)
    text = result.get("response") if isinstance(result, dict) else result
    if isinstance(text, dict):  # some models return parsed JSON already
        return json.dumps(text, ensure_ascii=False)
    return str(text or "")


def _parse(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not all(isinstance(data.get(k), str) and data[k].strip() for k in ("en", "hi", "pitch")):
        return None
    return {k: data[k].strip() for k in ("en", "hi", "pitch")}


def named_businesses(text: str, stats: dict) -> list[str]:
    """Top commercial names that appear in the text (first word of 4+ letters is enough)."""
    found = []
    lowered = text.lower()
    for item in stats.get("top_10_commercial", []):
        name = (item.get("name") or "").strip()
        key = next((w for w in re.split(r"[^\w]+", name) if len(w) >= 4), "")
        if key and key.lower() in lowered and name != "unnamed building":
            found.append(name)
    return found


def check(candidate: dict, stats: dict, tolerance: float) -> tuple[dict, list[str]]:
    """Strip phones, then list every field whose numbers are not in the input. The pitch,
    which goes to one business owner, may not mention other businesses (it invites claims
    like "X already uses solar" that no number check can catch)."""
    cleaned = {k: strip_phones(v) for k, v in candidate.items()}
    allowed = allowed_numbers(stats)
    problems = [
        f"{field}: {bad}" for field, text in cleaned.items() if (bad := unsupported_numbers(text, allowed, tolerance))
    ]
    if names := named_businesses(cleaned.get("pitch", ""), stats):
        problems.append(f"pitch names businesses: {names}")
    return cleaned, problems


def summarise(stats: dict, call=_call_model) -> dict:
    cfg = config()["ai"]
    attempts: list[str] = []
    for _ in range(2):
        try:
            parsed = _parse(call(stats, cfg["model"]))
        except AIUnavailable as error:
            attempts.append(str(error))
            break
        except requests.RequestException as error:
            attempts.append(f"request failed: {error}")
            continue
        if parsed is None:
            attempts.append("output was not valid JSON with en/hi/pitch")
            continue
        cleaned, problems = check(parsed, stats, cfg["number_tolerance"])
        if problems:
            attempts.append("numbers not in input: " + "; ".join(problems))
            continue
        return {**cleaned, "source": "ai", "model": cfg["model"], "notes": attempts}
    return {**template_summary(stats), "source": "template", "model": None, "notes": attempts}
