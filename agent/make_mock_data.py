#!/usr/bin/env python3
"""Generate mock weekly ad-level data for the creative reporting demo (13 weeks = 90 days).

Writes data/mock_ads.csv. Deterministic (fixed seed) so the demo always tells the same story.

Two platforms:
- Google search: six non-brand ad groups (one concept each) in a Non-brand campaign, plus a Brand campaign.
- Meta: UGC, founder story and screenshot concepts in a Prospecting campaign, plus a Retargeting ad.

Planted story:
- UGC_Problem_Video15_GenZ_v1 gets creative fatigue in the last five weeks.
- Retargeting_Test breaks the naming convention on purpose, so the guardrail has something to show.
- Google has no 3-second view metric, so its hook rate is blank (zero views), not zero percent.
"""
import csv
import random
from pathlib import Path

WEEKS = [f"2026-W{n}" for n in range(34, 47)]  # 13 weeks = the last 90 days

# name, platform, campaign, base_impressions_per_week, base_frequency, base_ctr, base_click_to_trial,
# hook_rate (0 where the platform has no 3-second metric), cpm, fatigued
ADS = [
    # Google, Non-brand campaign: one ad group per core category
    ("AISearchVisibility_Keyword_RSA_Marketer_v1", "Google", "Non-brand search", 40000, 1.3, 0.060, 0.10, 0.0, 12.0, 0.30, False),
    ("SEOAutomation_Outcome_RSA_Marketer_v1", "Google", "Non-brand search", 36000, 1.3, 0.050, 0.09, 0.0, 11.0, 0.28, False),
    ("AgencyUseCase_Proof_RSA_Agency_v1", "Google", "Non-brand search", 22000, 1.2, 0.050, 0.12, 0.0, 13.0, 0.35, False),
    ("LocalSMB_Keyword_RSA_SMB_v1", "Google", "Non-brand search", 30000, 1.2, 0.040, 0.08, 0.0, 9.0, 0.22, False),
    ("AdsUseCase_Outcome_RSA_Marketer_v1", "Google", "Non-brand search", 26000, 1.2, 0.050, 0.10, 0.0, 12.0, 0.27, False),
    ("ComparisonAlt_Compare_RSA_Marketer_v1", "Google", "Non-brand search", 18000, 1.2, 0.070, 0.14, 0.0, 14.0, 0.33, False),
    # Google, Brand campaign (kept separate so it does not flatter non-brand numbers)
    ("Brand_Brand_RSA_Marketer_v1", "Google", "Brand", 15000, 1.4, 0.050, 0.06, 0.0, 8.0, 0.40, False),
    # Meta, Prospecting campaign: UGC, founder story, screenshots
    ("UGC_Problem_Video15_GenZ_v1", "Meta", "Prospecting", 60000, 1.8, 0.018, 0.09, 0.34, 9.5, 0.25, True),
    ("UGC_Question_Video6_GenZ_v2", "Meta", "Prospecting", 52000, 1.6, 0.021, 0.08, 0.41, 9.0, 0.26, False),
    ("FounderStory_Stat_Video15_Millennials_v1", "Meta", "Prospecting", 45000, 1.5, 0.012, 0.07, 0.22, 8.0, 0.30, False),
    ("FounderStory_Problem_Video15_SMB_v1", "Meta", "Prospecting", 38000, 1.4, 0.013, 0.11, 0.25, 8.2, 0.34, False),
    ("Screenshots_Stat_Static_Millennials_v1", "Meta", "Prospecting", 41000, 1.7, 0.011, 0.06, 0.15, 7.5, 0.20, False),
    ("Screenshots_Demo_Carousel_SMB_v1", "Meta", "Prospecting", 33000, 1.4, 0.010, 0.10, 0.18, 7.0, 0.31, False),
    # Meta, Retargeting: breaks the naming convention on purpose
    ("Retargeting_Test", "Meta", "Retargeting", 12000, 2.0, 0.009, 0.05, 0.10, 6.5, 0.20, False),
]

FIELDS = [
    "week", "ad_name", "platform", "campaign", "spend", "impressions", "reach",
    "three_sec_views", "clicks", "trials",
]


def simulate(rng: random.Random):
    rows = []
    for name, platform, campaign, base_imp, base_freq, base_ctr, base_c2t, hook, cpm, paid, fatigued in ADS:
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
                "platform": platform,
                "campaign": campaign,
                "spend": round(imp * cpm / 1000, 2),
                "impressions": round(imp),
                "reach": round(reach),
                "three_sec_views": round(imp * hook * noise()) if hook else 0,
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
