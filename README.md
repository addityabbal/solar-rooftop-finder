# Solar Rooftop Lead Finder

Type one Indian pincode, get its 50 largest rooftops ranked by yearly solar saving:
roof and usable area (sq ft), address, building type, system size, saving, subsidy, payback.

**Live demo:** https://solar.adityabal.com (pre-scanned pincodes 380015, 400703, 400709).
**Write-up:** https://adityabal.com/projects/solar-rooftop-finder

- `worker/` Python pipeline (boundary, footprints, Google enrichment, savings, storage)
- `web/` Next.js 15 app (search, map, table, CSV, methodology, privacy)
- `config/` shared assumptions: `savings.json`, `pricing.json`, `showcase.json`
- `supabase/migrations/` database schema
- `.github/workflows/scan.yml` runs one scan when the web app asks for it

## Run it locally (no accounts needed)

Worker, from the repo root:

```bash
python -m venv worker/.venv
```

```bash
worker/.venv/Scripts/python -m pip install duckdb httpx pytest
```

```bash
worker/.venv/Scripts/python -m pytest
```

```bash
worker/.venv/Scripts/python -m worker.run_scan 380015
```

On macOS or Linux use `worker/.venv/bin/python`. A scan takes about a minute and writes
`web/data/scans/380015.json`. Add `--force` to re-scan.

Web app:

```bash
cd web
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000/p/380015. Tests: `npm test`. Production build: `npm run build`.

## What works without keys, and what needs them

| Feature | No keys | Needs |
| --- | --- | --- |
| Building footprints, ranking, savings | Yes | Nothing |
| Pincode boundary | Rough rectangle from OpenStreetMap | `GOOGLE_SERVER_KEY`, or a boundary file in `PINCODE_BOUNDARY_GEOJSON` |
| Usable roof area and sunshine | Footprint x 0.5, marked estimated | `GOOGLE_SERVER_KEY` (Solar API) |
| Address, building type | Coordinates, "Unclassified" | `GOOGLE_SERVER_KEY` (Geocoding, Places) |
| Business contact on a row | Off | `GOOGLE_SERVER_KEY` in `web/.env.local` |
| Google basemap | Outline map | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` |
| Shared database | JSON files in `web/data/scans` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Visitors scanning new pincodes | Off (pre-scanned only) | Supabase + `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` |
| Rate limits (3 per IP, 20 per day) | Off | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |

Copy `.env.example` to `.env` (worker) and to `web/.env.local` (web), then fill in what you have.

## Before your first paid scan

1. In Google Cloud: enable Solar API, Geocoding API, Places API (New), Maps JavaScript API.
   Set a budget alert of Rs 2,000 and daily quota caps on each.
2. Re-read the current Solar API, Geocoding and Places docs. `worker/google_client.py` was
   written from the public API reference and has only been tested against fake responses.
3. Fill `config/pricing.json` from the Google pricing page so scans report real cost.
4. Run `python -m worker.enrich 380015 --limit 10` and compare three rows with Google Maps by eye.

## Deploying (Cloudflare Workers)

The live demo runs at https://solar.adityabal.com as a Cloudflare Worker, built with
[OpenNext for Cloudflare](https://opennext.js.org/cloudflare). Config: `web/wrangler.jsonc`.

```bash
cd web
```

```bash
npm run deploy
```

`npm run deploy` bundles every scan in `web/data/scans` into the app, builds it for Workers
and deploys. On Windows, run it from a folder whose path is plain ASCII: the OpenNext build
fails on paths with non-Latin characters.

Without Supabase the deployed app is a read-only showcase: only bundled pincodes work, and
bookings are switched off. To scan any pincode live:

1. Supabase: run both files in `supabase/migrations/` in the SQL editor.
2. GitHub: add `GOOGLE_SERVER_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` as Actions secrets.
3. Worker secrets (`npx wrangler secret put <NAME>` in `web/`): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, `GOOGLE_SERVER_KEY`,
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CAMPAIGN_ADMIN_PASSWORD`.
4. Restrict the Google browser key to the domain and the server key to the four APIs.

## Campaign layer (Phase 7)

- `/campaigns/<pincode>`: dashboard with Activity, Prospects, Postcards and Bookings tabs.
- `/r/<pincode>-<roofId>`: public microsite per roof with a before/after diagram and a booking form.
- Postcards tab downloads a print-ready 6 x 4 inch PDF per roof, with a QR code to the microsite.
- Supabase: also run `supabase/migrations/0002_campaign.sql`.
- Set `CAMPAIGN_ADMIN_PASSWORD` before deploying. Mailing stays off unless `MAILING_ENABLED=true`.

## Not built yet

- Sending postcards through a vendor API (none found; see `docs/MAILING.md`).
- Playwright smoke test and Lighthouse pass.
- Per-state tariff table (`tariff_inr_per_unit.by_state` in `config/savings.json` is empty).

See `DECISIONS.md` for why things are the way they are.
