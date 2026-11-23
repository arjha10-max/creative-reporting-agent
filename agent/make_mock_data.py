#!/usr/bin/env python3
"""Generate mock weekly ad-level data for the creative reporting demo.

Writes data/mock_ads.csv. Deterministic (fixed seed) so the demo always tells the same story.
One ad (Cashback_Creator_Video15_GenZ_v1) is planted with creative fatigue from week 4 on:
frequency climbs while click-to-trial falls. One ad name breaks the naming convention on purpose,
so the parse-error guardrail has something to show.
"""
import csv
import random
from pathlib import Path

WEEKS = [f"2026-W{n}" for n in range(34, 47)]  # 13 weeks = the last 90 days

# name, base_impressions_per_week, base_frequency, base_ctr, base_click_to_trial, hook_rate, cpm, fatigued
ADS = [
    ("Cashback_Creator_Video15_GenZ_v1", 60000, 1.8, 0.018, 0.09, 0.34, 9.5, True),
    ("Cashback_Creator_Static_Millennials_v1", 45000, 1.5, 0.012, 0.07, 0.22, 8.0, False),
    ("Cashback_Question_Video6_GenZ_v2", 52000, 1.6, 0.021, 0.08, 0.41, 9.0, False),
    ("Travel_Stat_Carousel_Millennials_v1", 38000, 1.4, 0.011, 0.11, 0.18, 7.5, False),
    ("Travel_Problem_Video15_Families_v1", 41000, 1.7, 0.014, 0.10, 0.30, 8.5, False),
    ("Travel_Creator_Video6_GenZ_v3", 48000, 1.5, 0.017, 0.06, 0.37, 9.2, False),
    ("Savings_Question_Static_Families_v2", 33000, 1.3, 0.010, 0.12, 0.15, 7.0, False),
    ("Savings_Stat_Video15_Millennials_v2", 36000, 1.6, 0.013, 0.09, 0.28, 8.2, False),
    ("Savings_Problem_Carousel_GenZ_v1", 29000, 1.4, 0.012, 0.08, 0.20, 8.8, False),
    ("Retargeting_Test", 12000, 2.0, 0.009, 0.05, 0.10, 6.5, False),  # breaks the naming convention on purpose
]

FIELDS = [
    "week", "ad_name", "spend", "impressions", "reach",
    "three_sec_views", "clicks", "trials",
]


def simulate(rng: random.Random):
    rows = []
    for name, base_imp, base_freq, base_ctr, base_c2t, hook, cpm, fatigued in ADS:
        for w, week in enumerate(WEEKS):
            noise = lambda: rng.uniform(0.97, 1.03)
            imp = base_imp * (1 + 0.03 * w) * noise()
            fatigue_weeks = max(0, w - 8)  # fatigue starts in the last five weeks of the window
            if fatigued:
                freq = base_freq * (1.2 ** fatigue_weeks) * noise()  # frequency compounds week over week
            else:
                freq = base_freq * (1 + 0.01 * w) * noise()
            reach = imp / freq
            if fatigued:
                ctr = base_ctr * (0.85 ** fatigue_weeks) * noise()
                c2t = base_c2t * (0.8 ** fatigue_weeks) * noise()
            else:
                ctr = base_ctr * noise()
                c2t = base_c2t * noise()
            clicks = imp * ctr
            trials = clicks * c2t
            rows.append({
                "week": week,
                "ad_name": name,
                "spend": round(imp * cpm / 1000, 2),
                "impressions": round(imp),
                "reach": round(reach),
                "three_sec_views": round(imp * hook * noise()),
                "clicks": round(clicks),
                "trials": round(trials),
            })
    return rows


def main():
    out = Path(__file__).resolve().parent.parent / "data" / "mock_ads.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = simulate(random.Random(42))
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()
