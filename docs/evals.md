# Evals

Run: `python evals/run_evals.py` (also runs in CI on every push).

| Eval | How | Pass bar | Status |
| --- | --- | --- | --- |
| Number faithfulness | 30 summary cases in `evals/summary_cases.json` through the same guardrail as the pipeline. 12 should pass (numbers copied, phone stripped, 1% formatting), 18 should be caught (invented rupees, changed payback, invented Hindi count, invented %, MW→kW conversion, derived figures). The template fallback must pass for every case. | 100% | 30/30 |
| Roof area accuracy | 50 roofs you measure with the Google Maps measure tool across 5 pincodes (dense city, suburb, town, village, industrial), entered in `evals/area_ground_truth.csv` by Plus Code. | Median error ≤ 20% | Waiting for measurements |
| Hindi quality | 15 summaries rated 1–5 by you and one other native speaker. | Average ≥ 4 | Not started |
| Lead usefulness | Show the top 20 leads to 2 real installers; record how many they would call. | Record the result | Not started |

The summary eval inputs for pincodes other than 400703 are synthetic numbers, made up to exercise
the checker; they are not results.

## Failure modes seen so far

- **Directory coordinates.** 600132's directory position is 618 km away; 411014 and 700001 are about
  28 km off. Caught by the Nominatim cross-check (see decisions).
- **Big footprints with many listings.** A mall or office complex is one footprint containing dozens
  of businesses; the card shows the listing with a phone or website and the highest confidence, which
  may not be the building's owner.
- **Score saturation.** Many large commercial roofs hit the same score (86.9 in 400703) because area is
  capped at 400 m² in the score; ties are broken by yearly saving.

## How to measure a roof

1. Open the pincode in the app, click a roof, copy its Plus Code.
2. Paste the Plus Code into Google Maps, right-click the roof corner, "Measure distance", trace the outline.
3. Add a row: `pin,plus_code,area_type,measured_sqft,notes` (area_type: dense / suburb / town / village / industrial).
