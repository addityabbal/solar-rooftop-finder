# Decisions

Date, decision, reason. Newest first.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-11-17 | Deployed on Cloudflare Workers (OpenNext) at solar.adityabal.com instead of Vercel. Stored scans are bundled into the app at build time. | Portfolio domain and account already on Cloudflare; no new accounts. Workers have no project files on disk. |
| 2026-11-17 | Deployed without a database, bookings and campaign event writes are off, and the campaign dashboard is public. | Nothing personal can be stored, so nothing needs a password. Setting `SUPABASE_URL` turns the password requirement back on. |
| 2026-11-17 | Mailing is a manual hand-off; the app only records it, behind `MAILING_ENABLED` and `CAMPAIGN_INSTALLER_NAME`. | No India Post or Indian print-and-post API was found (see `docs/MAILING.md`). |
| 2026-11-17 | Campaign dashboard and postcard downloads sit behind `CAMPAIGN_ADMIN_PASSWORD` (HTTP Basic). Open on localhost when unset, closed in production. | The Bookings tab shows names and phone numbers. |
| 2026-11-17 | Bookings are the one place personal data is stored: name and phone typed by the person, with consent text and timestamp. Event log never carries them. Local booking files are git-ignored. | Opt-in with consent is the lawful route named in the plan; keeps the "no personal data of residents" rule otherwise intact. |
| 2026-11-17 | Roof visual is our own SVG. Uses Solar API panel positions when stored; otherwise an illustrative grid, labelled as such. | No Google imagery printed or redistributed. Without a Google key there are no panel positions. |
| 2026-11-17 | QR codes point to `/q/<roofId>`, which logs the scan and redirects to `/r/<roofId>`. | Counts postcard scans separately from ordinary page views. |
| 2026-11-17 | "Visual drawn" and "Postcard generated" are logged the first time a roof's postcard PDF is downloaded. | That is when the artefacts actually come into existence. |
| 2026-11-17 | Without Supabase keys, scans are stored as JSON files in `web/data/scans/` and the web app reads them. | Lets the whole app run and be checked before any account exists. Pre-scanned showcase pincodes can also ship this way. |
| 2026-11-17 | Local development fallback for the pincode rectangle: OpenStreetMap Nominatim, used only when there is no boundary file and no Google key. Off in the GitHub workflow. | Lets Phase 1 run with no paid key. It is an official public API, results are flagged approximate. The rectangle is much larger than the real pincode, so replace it before launch. |
| 2026-11-17 | India Post pincode boundary file is supported through `PINCODE_BOUNDARY_GEOJSON` but not bundled. | Availability and licence on data.gov.in not verified. Open question for Aditya. |
| 2026-11-17 | Worker stores only Google `place_id`, type and match distance. Name, phone and website are fetched by the web server when a visitor opens a commercial row. | Hard rule on Places caching; also the cheapest field mask. |
| 2026-11-17 | Building type: nearest Places result within 30 m. Institutional if its types include school, hospital, place of worship or government; otherwise commercial; no result means residential. No Google key means "unclassified", priced as commercial with no subsidy. | Simple, explainable rule. Unclassified is priced conservatively. |
| 2026-11-17 | System size is rounded to the nearest 0.5 kW. | Matches the plan's worked example (300 sq ft gives 3 kW) and how systems are sold. |
| 2026-11-17 | When Solar API returns sunshine hours, yield = hours x 0.75 performance ratio. | Raw sunshine hours overstate output; 0.75 is a common derate. Editable in `config/savings.json`. |
| 2026-11-17 | Savings config is `config/savings.json`, read by both Python and TypeScript. | The plan names both `.ts` and `.json`; one JSON file keeps the two languages in step. |
| 2026-11-17 | Google prices are not hard-coded. `config/pricing.json` holds nulls until filled in; scans report call counts either way. | Prices change; the plan says not to quote them. |
| 2026-11-17 | Open Buildings is read from the single India GeoParquet on source.coop using its `bbox` column. Measured: 207,817 buildings for the 380015 rectangle in 58 seconds. | Verified the file has row-group bbox statistics, so only overlapping groups download. |
| 2026-11-17 | Area is measured in the local UTM zone. | Metric projection, accurate at city scale anywhere in India. |
| 2026-11-17 | Python 3.14 used locally with a plain venv; `pyproject.toml` works with uv too. | uv is not installed on this machine. CI uses 3.12. |
