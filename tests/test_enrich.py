"""Run with: python3 -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agent"))

from creative_report import build_report, enrich, load_rows, platform_view, window_view  # noqa: E402

DATA = ROOT / "data" / "mock_ads.csv"


class Enrich(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows, errors = load_rows(DATA)
        cls.report = platform_view(window_view(enrich(build_report(rows, errors), rows), rows), rows)

    def test_trend_has_one_point_per_week(self):
        self.assertEqual(len(self.report["trend"]), 13)
        self.assertEqual(self.report["trend"][-1]["week"], "2026-W46")

    def test_scorecard_covers_every_creative_with_a_verdict(self):
        verdicts = {s["value"]: s["verdict"] for s in self.report["scorecard"]}
        self.assertEqual(len(verdicts), 13)
        self.assertEqual(verdicts["UGC_Problem_Video15_GenZ_v1"], "Pause")
        self.assertEqual(verdicts["AISearchVisibility_Keyword_RSA_Marketer_v1"], "Scale")

    def test_cost_per_paying_customer_is_spend_over_paying_customers(self):
        b = self.report["window"]["benchmark"]
        self.assertAlmostEqual(b["cost_per_paying_customer"], b["spend"] / b["paying_customers"], places=2)

    def test_platform_and_concept_breakdowns(self):
        platforms = {p["platform"] for p in self.report["platforms"]}
        self.assertEqual(platforms, {"Google", "Meta"})
        concepts = {c["concept"] for c in self.report["concepts"]}
        for expected in ("AISearchVisibility", "SEOAutomation", "AgencyUseCase", "LocalSMB",
                         "AdsUseCase", "ComparisonAlt", "Brand", "UGC", "FounderStory", "Screenshots"):
            self.assertIn(expected, concepts)

    def test_google_has_no_hook_rate(self):
        google = [a for a in self.report["ads"] if a["tags"] and a["latest"]["hook_rate"] is None]
        self.assertTrue(google)

    def test_combos_are_ranked_by_trial_cpa(self):
        cpas = [c["trial_cpa"] for c in self.report["combos"]]
        self.assertEqual(cpas, sorted(cpas))

    def test_insights_cover_spend_and_creatives(self):
        titles = [i["title"] for i in self.report["insights"]]
        self.assertIn("Spend", titles)
        self.assertIn("Most expensive creative", titles)

    def test_fatigued_ad_gets_a_high_priority_refresh(self):
        titles = [r["title"] for r in self.report["recommendations"] if r["priority"] == "high"]
        self.assertIn("Refresh UGC_Problem_Video15_GenZ_v1", titles)

    def test_untagged_names_get_a_fix_recommendation(self):
        titles = [r["title"] for r in self.report["recommendations"]]
        self.assertIn("Fix untagged ad names before launch", titles)

    def test_recommendations_sorted_high_first(self):
        order = {"high": 0, "medium": 1, "low": 2}
        ranks = [order[r["priority"]] for r in self.report["recommendations"]]
        self.assertEqual(ranks, sorted(ranks))


if __name__ == "__main__":
    unittest.main()
