"""Evals. Runs in CI on every push.

1. Number faithfulness (automatic, gate = 100%): every summary case in summary_cases.json
   goes through the same guardrail the pipeline uses. Cases marked "expect": "reject" must be
   caught; "accept" cases must pass. The template summary for every case must pass too.
2. Roof area accuracy (needs your hand measurements): compares area_ground_truth.csv
   against pipeline output files. Gate = median error <= 20% once at least 10 rows are filled.

Usage:  python evals/run_evals.py [--results pipeline/out]
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "pipeline"))

from lib import ai_summary, config  # noqa: E402


def faithfulness() -> bool:
    cases = json.loads((HERE / "summary_cases.json").read_text(encoding="utf-8"))
    tol = config()["ai"]["number_tolerance"]
    passed = 0
    for case in cases:
        _, problems = ai_summary.check(case["output"], case["input"], tol)
        caught = bool(problems)
        ok = caught if case["expect"] == "reject" else not caught
        _, template_problems = ai_summary.check(ai_summary.template_summary(case["input"]), case["input"], tol)
        ok = ok and not template_problems
        passed += ok
        if not ok:
            print(f"  FAIL {case['id']}: expected {case['expect']}, problems={problems}, template={template_problems}")
    rate = passed / len(cases)
    print(f"Number faithfulness: {passed}/{len(cases)} cases ({rate:.0%}); gate 100%")
    return rate == 1.0


def area_accuracy(results_dir: Path) -> bool:
    rows = list(csv.DictReader(open(HERE / "area_ground_truth.csv", newline="", encoding="utf-8")))
    measured = [r for r in rows if r.get("measured_sqft", "").strip()]
    if len(measured) < 10:
        print(f"Roof area accuracy: {len(measured)} hand-measured roofs so far; need 10+ to score (target 50). Skipped.")
        return True
    errors = []
    for r in measured:
        path = results_dir / f"{r['pin']}.json"
        if not path.exists():
            print(f"  missing result file {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        roof = next((x for x in data["roofs"] if x["plus_code"] == r["plus_code"]), None)
        if roof is None:
            print(f"  {r['plus_code']} not in the top roofs of {r['pin']}")
            continue
        truth = float(r["measured_sqft"])
        errors.append(abs(roof["area_sqft"] - truth) / truth)
    if not errors:
        print("Roof area accuracy: no measured roof matched a result. Skipped.")
        return True
    median = statistics.median(errors)
    print(f"Roof area accuracy: median error {median:.0%} over {len(errors)} roofs; gate 20%")
    return median <= 0.20


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", default=str(HERE.parent / "pipeline" / "out"))
    args = parser.parse_args()
    ok = faithfulness()
    ok = area_accuracy(Path(args.results)) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
