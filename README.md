# Solar Rooftop Finder

Type a 6-digit Indian pincode. Get the roofs in that area ranked for solar: usable roof area in
sq ft, system size, yearly units, rupees saved after the PM Surya Ghar subsidy, payback, an
approximate address with a Plus Code, and a public business phone or website where one exists.
Plus an AI summary in English and Hindi. Runs at ₹0 a month on free tiers.

**Live:** https://solar.adityabal.com · **Case study:** https://adityabal.com/projects/solar-rooftop-finder

## How it works

```
browser ──► Cloudflare Pages (web/ + functions/) ──► KV  pin:<pincode>  ── hit ──► result JSON
                     │ miss
                     ├─► D1 build_requests (queued, daily cap 25)
                     └─► GitHub Actions build-pincode.yml
                              └─ pipeline/build_pincode.py
                                   ├─ pincode centre (Dept of Posts, checked against OSM)
                                   ├─ DuckDB over Overture Maps on S3: buildings, places, roads
                                   ├─ NASA POWER sunlight
                                   ├─ solar maths + lead score  (pipeline/data/config.json)
                                   ├─ Workers AI summary, EN + HI, number-checked
                                   └─ writes KV + D1 status
```

The heavy work runs once per pincode in GitHub Actions; every visit after that is one KV read.

## Repo

| Path | What |
| --- | --- |
| `pipeline/` | Python pipeline. `build_pincode.py` is the entry point; `lib/` has geo, overture, solar, scoring, address, sunlight, ai_summary, publish. |
| `pipeline/data/` | `config.json` (every assumption), `tariffs.json`, `pincode_centroids.csv`. |
| `web/` | Static site: `index.html`, `app.js`, `styles.css`. No build step. MapLibre on OpenFreeMap tiles. |
| `functions/api/` | Pages Functions: `pincode/[pin]`, `status/[pin]`, `lead`. |
| `migrations/` | D1 schema. |
| `evals/` | Number-faithfulness cases and roof-area ground truth. |
| `docs/` | PRD, decisions, evals write-up. |

## Run the pipeline locally

```bash
python -m venv pipeline/.venv
```

```bash
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt
```

```bash
pipeline/.venv/Scripts/python pipeline/build_pincode.py 400703 --out pipeline/out/400703.json
```

On macOS/Linux use `pipeline/.venv/bin/python`. A build takes about 3–6 minutes. Without AI credentials
the summary uses the template. For an AI summary from a laptop, run the local proxy in another terminal
(`npx wrangler dev` in `pipeline/tools/ai-proxy`) and set `AI_PROXY_URL=http://127.0.0.1:8799`.
To publish to KV with your own wrangler login, add `--publish --via wrangler`.

Tests and evals:

```bash
cd pipeline && .venv/Scripts/python -m pytest -q
```

```bash
pipeline/.venv/Scripts/python evals/run_evals.py
```

## Deploy

```bash
npx wrangler pages deploy
```

### One-time setup that needs you

On-demand builds of new pincodes need two tokens. Until they exist the site serves the pre-built pincodes
and says new ones can't be built yet.

1. **Cloudflare API token for GitHub Actions.** Cloudflare dashboard → My Profile → API Tokens → Create
   Token → Custom. Permissions: Account · Workers KV Storage · Edit; Account · D1 · Edit; Account · Workers AI · Read.
   Then in GitHub → Settings → Secrets and variables → Actions:
   - secrets `CF_API_TOKEN` (the token) and `CF_ACCOUNT_ID`
   - variables `KV_NAMESPACE_ID` and `D1_DATABASE_ID` (both in `wrangler.toml`)
2. **GitHub token for the website.** GitHub → Settings → Developer settings → Fine-grained tokens:
   only this repository, permission Actions: Read and write. Then:

   ```bash
   npx wrangler pages secret put GH_TOKEN --project-name solar-rooftop-finder
   ```

3. **Quote form.** Create a Turnstile widget for `solar.adityabal.com`, put its site key in
   `wrangler.toml` as `TURNSTILE_SITE_KEY`, and the secret with
   `npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name solar-rooftop-finder`.

### Staying at ₹0

Stay on the Workers Free plan with no card on file (over a limit, requests fail instead of billing),
never enable R2, keep the repo public (free Actions minutes), keep the 25 builds/day cap.

See `ATTRIBUTION.md` for data credits and `docs/decisions.md` for why things are the way they are.
