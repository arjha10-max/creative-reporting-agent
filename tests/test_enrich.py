"""Run with: python3 -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agent"))

from creative_report import build_report, enrich, load_rows  # noqa: E402

DATA = ROOT / "data" / "mock_ads.csv"


class Enrich(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows, errors = load_rows(DATA)
        cls.report = enrich(build_report(rows, errors), rows)

    def test_trend_has_one_point_per_week(self):
        self.assertEqual(len(self.report["trend"]), 6)
        self.assertEqual(self.report["trend"][-1]["week"], "2026-W46")

    def test_insights_cover_spend_and_creatives(self):
        titles = [i["title"] for i in self.report["insights"]]
        self.assertIn("Spend", titles)
        self.assertIn("Most expensive creative", titles)

    def test_fatigued_ad_gets_a_high_priority_refresh(self):
        titles = [r["title"] for r in self.report["recommendations"] if r["priority"] == "high"]
        self.assertIn("Refresh Cashback_Creator_Video15_GenZ_v1", titles)

    def test_untagged_names_get_a_fix_recommendation(self):
        titles = [r["title"] for r in self.report["recommendations"]]
        self.assertIn("Fix untagged ad names before launch", titles)

    def test_recommendations_sorted_high_first(self):
        order = {"high": 0, "medium": 1, "low": 2}
        ranks = [order[r["priority"]] for r in self.report["recommendations"]]
        self.assertEqual(ranks, sorted(ranks))


if __name__ == "__main__":
    unittest.main()
