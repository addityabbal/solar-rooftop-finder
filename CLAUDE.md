# Solar Rooftop Lead Finder: project instructions

## What we are building
A web app. Input: one Indian pincode (6 digits). Output: a ranked list and map of
rooftops suitable for solar, each with roof area and usable area in sq ft, postal
address, building type, public business contact (commercial only), estimated system
size in kW, yearly units, yearly saving in INR, subsidy, and payback years.
Owner: Aditya (product manager, not a full-time developer). Explain choices in plain
language and keep setup steps copy-pasteable.

## Pipeline (do not reorder)
1. Validate pincode; return cached scan if present.
2. Get boundary polygon (India Post pincode GeoJSON; fallback Geocoding viewport).
3. Get building footprints inside it (Google-Microsoft-OSM Open Buildings, GeoParquet).
4. Drop roofs under 40 m2; shortlist top 50 by area.
5. Enrich each: Solar API buildingInsights, reverse geocode, Places Nearby (30 m).
   Solar API 404 -> usable area = footprint x 0.5, flagged "estimated".
6. Apply savings model from config/savings.json, rank, store.

## Stack
Next.js 15 + TypeScript + Tailwind on Vercel. Supabase Postgres + PostGIS.
Python 3.12 worker (DuckDB spatial, httpx) for the pipeline. Google Maps JS API for
the map. Upstash Redis for rate limits.

## Hard rules
- Never scrape Google Maps, Justdial, IndiaMART or any website. Official APIs only.
- Never collect, infer or store contact details of private individuals. Residential
  rows carry address only. Business contact comes only from Places API.
- Never analyse map tiles or screenshots with a vision model.
- Store Google place_id and our own computed fields; re-fetch Places details on
  view rather than caching them long-term. Check current Google Maps Platform terms
  before changing any caching behaviour.
- API keys live only in server-side environment variables. The browser key is
  restricted by HTTP referrer and to Maps JS only.
- Every external call goes through one client module with retry, timeout and a
  per-scan budget counter. A scan stops if it exceeds 50 Solar API calls.
- All money and tariff assumptions come from config/savings.json. No magic numbers.
- Areas are stored in m2 and displayed in sq ft (x 10.764).
- Every result shows "estimate, not a quotation" and a plus/minus 15% range.

## Working style
- Build one phase at a time. Stop at the end of each phase and show how to test it.
- Write tests for the savings model and pincode validation before the UI.
- Before using any API, read its current docs and pricing; do not rely on memory.
- If a data source is missing or its licence is unclear, stop and ask.
- Keep a DECISIONS.md log: date, decision, reason.

## Definition of done for v1
A visitor opens the live URL, types 380015, and within 2 seconds sees a map and a
table of at least 20 rooftops with all output fields, and can download a CSV.

## Repo map
- `config/` shared JSON: `savings.json` (every money assumption), `pricing.json`
  (Google per-call prices, fill in from the pricing page), `showcase.json` (pre-scanned pincodes).
- `worker/` Python pipeline. Run from the repo root: `python -m worker.run_scan 380015`.
- `web/` Next.js app. `web/data/scans/*.json` is the local store used when Supabase
  is not configured.
- `supabase/migrations/` database schema.
