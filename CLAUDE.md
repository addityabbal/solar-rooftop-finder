# Solar Rooftop Finder: project instructions

Zero-cost build. Owner: Aditya (product manager). Explain choices plainly; keep setup steps copy-pasteable.

## Shape
- `pipeline/` Python, runs in GitHub Actions once per pincode (or locally). Entry: `pipeline/build_pincode.py <pin>`.
- `web/` plain HTML/JS/CSS, no framework, no build step. `functions/api/` Cloudflare Pages Functions.
- Storage: KV `RESULTS` (key `pin:<pincode>`), D1 `solar-db` (`build_requests`, `leads`). IDs in `wrangler.toml`.
- Previous Next.js version with the campaign layer: git tag `v0-nextjs-campaign`.

## Hard rules
- ₹0: Workers Free plan, no R2, no paid APIs. Public repo for free Actions minutes. 25 builds/day cap.
- Never collect, infer or store residents' contact details. Contacts shown come only from public listings
  (Overture places). Leads come only from the opt-in form, stored with the consent text.
- Never per-visitor heavy work: the site only reads KV. One AI call per pincode build, never per visit.
- The AI never computes numbers. Every number in a summary must appear in its input (guardrail in
  `lib/ai_summary.py`); otherwise the template is used.
- Every assumption lives in `pipeline/data/config.json` or `tariffs.json`, and is shown in the
  "How we calculate" drawer. No magic numbers in code.
- Areas in sq ft in the UI (m² × 10.764). Every figure says "estimate, not a quotation".
- Pin the Overture release in config. Check its schema before bumping (places changed `categories` → `basic_category`).
- No reverse geocoding per building (rate limits): address = nearest road + locality + Plus Code.

## Working style
- One milestone at a time; show how to test it.
- Tests for solar maths and guardrails before UI. Run `pytest` and `evals/run_evals.py` before pushing.
- Read current docs/limits before relying on any free tier; they change.
- Log decisions in `docs/decisions.md` (date, decision, reason).
- On Windows with this OneDrive path, keep commands ASCII-safe (set PYTHONIOENCODING=utf-8 when printing).
