#!/usr/bin/env python3
"""Creative reporting agent (demo build).

Steps:
1. Read weekly ad-level rows (CSV). In production this would be a scheduled pull from each platform.
2. Parse every ad name against the tagging convention CONCEPT_HOOK_FORMAT_AUDIENCE_VARIANT.
   Names that break the convention are reported, not silently dropped.
3. Roll up hook rate, CTR, click-to-trial, trial CPA and frequency by each tag.
4. Flag fatigue: a tag whose frequency rose week over week while click-to-trial fell.
5. Write web/report-data.js for the dashboard.

Rules-based on purpose. The flags are a prompt for a human to look, not a decision.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

TAG_DIMS = ("concept", "hook", "format", "audience")
SUM_FIELDS = ("spend", "impressions", "reach", "three_sec_views", "clicks", "trials")

FREQ_RISE_THRESHOLD = 0.15  # frequency up 15%+ week over week
C2T_DROP_THRESHOLD = 0.15   # click-to-trial down 15%+ week over week

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "mock_ads.csv"
DEFAULT_OUTPUT = ROOT / "web" / "report-data.js"


def parse_ad_name(name: str) -> dict:
    """'Cashback_Creator_Video15_GenZ_v1' -> tag dict. Raises ValueError if the name breaks the convention."""
    parts = name.split("_")
    if len(parts) < 5 or not all(parts[:4]):
        raise ValueError(f"expected CONCEPT_HOOK_FORMAT_AUDIENCE_VARIANT, got '{name}'")
    tags = dict(zip(TAG_DIMS, parts[:4]))
    tags["variant"] = "_".join(parts[4:])
    return tags


def safe_div(num, den):
    return round(num / den, 4) if den else None


def kpis(t) -> dict:
    return {
        "spend": round(t["spend"], 2),
        "hook_rate": safe_div(t["three_sec_views"], t["impressions"]),
        "ctr": safe_div(t["clicks"], t["impressions"]),
        "click_to_trial": safe_div(t["trials"], t["clicks"]),
        "trial_cpa": safe_div(t["spend"], t["trials"]),
        "frequency": safe_div(t["impressions"], t["reach"]),
    }


def pct_change(new, old):
    if new is None or old in (None, 0):
        return None
    return round((new - old) / old, 4)


def load_rows(path: Path):
    rows, errors, seen_bad = [], [], set()
    with path.open(newline="") as f:
        for line_no, raw in enumerate(csv.DictReader(f), start=2):
            try:
                tags = parse_ad_name(raw["ad_name"])
            except ValueError as e:
                # one entry per bad name, not one per weekly row
                if raw["ad_name"] not in seen_bad:
                    seen_bad.add(raw["ad_name"])
                    errors.append({"first_line": line_no, "ad_name": raw["ad_name"], "problem": str(e)})
                continue
            row = {"week": raw["week"], "ad_name": raw["ad_name"], **tags}
            for field in SUM_FIELDS:
                row[field] = float(raw[field])
            rows.append(row)
    return rows, errors


def build_report(rows, errors):
    weeks = sorted({r["week"] for r in rows})
    if len(weeks) < 2:
        raise ValueError("need at least two weeks of data to compare week over week")
    latest, prior = weeks[-1], weeks[-2]

    alerts, tag_tables = [], {}
    # Tags roll up the tag dimensions; ad_name is checked separately so one fatigued ad
    # is not averaged away inside a bucket that also holds healthy ads.
    for dim in TAG_DIMS + ("ad_name",):
        buckets = {}
        for r in rows:
            b = buckets.setdefault((r[dim], r["week"]), defaultdict(float))
            for f in SUM_FIELDS:
                b[f] += r[f]

        table = []
        for value in sorted({v for v, _ in buckets}):
            cur_t = buckets.get((value, latest))
            old_t = buckets.get((value, prior))
            if cur_t is None:
                continue
            cur = kpis(cur_t)
            old = kpis(old_t) if old_t else None
            wow = {
                k: (pct_change(cur[k], old[k]) if old else None)
                for k in ("frequency", "click_to_trial", "ctr", "hook_rate", "trial_cpa")
            }
            if dim != "ad_name":
                table.append({"value": value, "latest": cur, "wow": wow})

            if old and wow["frequency"] is not None and wow["click_to_trial"] is not None:
                if wow["frequency"] >= FREQ_RISE_THRESHOLD and wow["click_to_trial"] <= -C2T_DROP_THRESHOLD:
                    alerts.append({
                        "dimension": dim,
                        "value": value,
                        "frequency": {"prior": old["frequency"], "latest": cur["frequency"]},
                        "click_to_trial": {"prior": old["click_to_trial"], "latest": cur["click_to_trial"]},
                        "message": (
                            f"{dim} = {value}: frequency rose {old['frequency']} to {cur['frequency']} "
                            f"while click-to-trial fell {old['click_to_trial']} to {cur['click_to_trial']}. "
                            "Check creative fatigue before adding spend."
                        ),
                    })
        if dim != "ad_name":
            tag_tables[dim] = sorted(table, key=lambda e: -e["latest"]["spend"])

    alerts.sort(key=lambda a: -(a["frequency"]["latest"] - a["frequency"]["prior"]))
    return {
        "latest_week": latest,
        "prior_week": prior,
        "weeks": weeks,
        "ad_count": len({r["ad_name"] for r in rows}),
        "thresholds": {"frequency_rise": FREQ_RISE_THRESHOLD, "click_to_trial_drop": C2T_DROP_THRESHOLD},
        "alerts": alerts,
        "tag_tables": tag_tables,
        "parse_errors": errors,
        "scope": (
            "Demo on mock data. Built: naming-convention check, weekly tag rollup, fatigue rule. "
            "Next: live platform pulls, enforcing the naming convention at launch, "
            "and an LLM step that drafts the weekly narrative for the human brief writer."
        ),
    }


def write_js(report: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window.REPORT_DATA = " + json.dumps(report, indent=2) + ";\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = ap.parse_args()

    rows, errors = load_rows(args.input)
    report = build_report(rows, errors)
    write_js(report, args.output)
    print(f"Weeks {report['weeks'][0]}..{report['latest_week']} | ads {report['ad_count']} | "
          f"alerts {len(report['alerts'])} | parse errors {len(errors)}")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
