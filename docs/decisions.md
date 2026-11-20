# Decisions

Date, decision, reason. Newest first. The earlier Next.js version (with postcards, per-roof
pages and a campaign dashboard) is kept under the git tag `v0-nextjs-campaign`.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-11-20 | Rebuilt to the zero-cost plan: Python pipeline in GitHub Actions, results in KV, build log and leads in D1, plain HTML/JS on Cloudflare Pages. Campaign layer dropped from v1. | Runs at ₹0 on free tiers; the live site only reads KV. Code a reviewer can follow without a framework. |
| 2026-11-20 | Open footprints (Overture, which merges Google and Microsoft AI-detected buildings with OSM) instead of our own vision model. | Roof detection is already done upstream, for free. Our model would cost imagery licences and months. |
| 2026-11-20 | Opt-in quote form instead of collecting residents' contacts. Contacts shown are only public business listings from Overture places. | DPDP Act 2023: personal data needs consent. The consent text is stored with each lead. |
| 2026-11-20 | Precompute once per pincode, never per visitor. AI summary is one call per pincode build. | Keeps Workers AI, KV and CPU inside free limits however many people visit. |
| 2026-11-20 | Address = nearest named road (Overture transportation) + pincode locality + Plus Code, not reverse geocoding. | Nominatim allows about 1 request a second; a pincode can hold 20,000 buildings. |
| 2026-11-20 | Pincode centre: Department of Posts directory, checked against one Nominatim lookup per build; Nominatim wins if they differ by more than 5 km. | The directory has bad rows: 600132 sits 618 km away in Telangana, 700001 and 411014 are 28–29 km off. Good rows agree within 1.3 km. One lookup per build is well within Nominatim's policy. |
| 2026-11-20 | Building type: Overture subtype; any public listing inside a building makes it commercial. Civic, education, medical, religious and similar subtypes are institutional. Everything else counts as residential. | Plan rule: subsidy only for buildings that look residential. Most Indian footprints have no subtype (7,427 of 7,611 in 400703), so the listing check does most of the work. |
| 2026-11-20 | Public contacts shown for commercial and institutional roofs, not only commercial. | Schools, hospitals and temples are public bodies with public listings; showing their published phone is in the same spirit as a business listing. |
| 2026-11-20 | Lead score weights kept exactly as planned (area 40, sunlight 20, public contact 20, commercial 10, payback 10). | Finding: contact + commercial add 30 points no home can earn, so the top 500 in 400703 are all businesses and institutions. That suits installers (they can call today) but hides homes; homes come in through the opt-in form. Revisit after installer feedback. |
| 2026-11-20 | Per-roof JSON trimmed (no Overture ids, 5-decimal coordinates, address built in the browser). | Keeps each KV value under about 300 KB as planned. |
| 2026-11-20 | Summary model: Llama 3.3 70B (fp8-fast) on Workers AI, not 8B. | Hindi quality matters and it's one call per pincode, roughly 150–300 neurons, well inside 10,000 a day. Configurable in config.json. |
| 2026-11-20 | Local builds use a localhost-only Workers AI proxy (`pipeline/tools/ai-proxy`) run with `wrangler dev`. | Lets a laptop seed pincodes with your own wrangler login, without minting an API token. Never deployed. |
| 2026-11-20 | Tariffs: national approximate defaults (₹7 homes, ₹9 businesses) until each state's tariff order is entered by hand in `tariffs.json`. | The plan says enter from tariff orders; none are verified yet, so the UI labels tariffs approximate. |
| 2026-11-20 | Pinned Overture release 2026-11-18.0. Places theme now uses `basic_category` (the old `categories` column is gone). | Repeatable results; schema changed between releases. |
