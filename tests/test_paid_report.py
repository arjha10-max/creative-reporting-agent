"""Runs against the real workbook when it is present; skipped otherwise (the workbook is never committed).

Run with: python3 -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agent"))

from paid_report import build, load  # noqa: E402

WORKBOOK = Path("/mnt/user-data/uploads/d6e2f3dd-Paid_Performance_Assessment_Data.xlsx")
MAP = ROOT / "data" / "ad_name_map.csv"


@unittest.skipUnless(WORKBOOK.exists() and MAP.exists(), "workbook or name map not present")
class PaidReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data, mapping = load(WORKBOOK, MAP)
        cls.r = build(data, mapping)

    def test_window_is_63_days(self):
        self.assertEqual(self.r["window"]["days"], 63)
        self.assertEqual(self.r["window"]["weeks"], 9)

    def test_cost_per_trial_is_spend_over_trials(self):
        b = self.r["window"]["benchmark"]
        self.assertAlmostEqual(b["cost_per_trial"], b["spend"] / b["trials"], places=2)

    def test_channel_trials_match_posthog_paid_sources(self):
        b = self.r["window"]["benchmark"]
        self.assertEqual(b["trials"], 879)  # facebook 509 + google 370
        self.assertEqual(b["unattributed_trials"], 808)

    def test_no_paying_customer_fields_leak_into_report(self):
        self.assertNotIn("paying_customers", str(self.r))
        self.assertNotIn("cost_per_paying_customer", str(self.r))

    def test_paused_ad_is_not_scored_as_scale(self):
        verdicts = {s["value"]: s["verdict"] for s in self.r["scorecard"]}
        self.assertEqual(verdicts["UGC_Founder_v2"], "Paused")

    def test_google_has_no_creative_rows(self):
        self.assertTrue(all(s["platform"] == "Meta" for s in self.r["scorecard"]))


if __name__ == "__main__":
    unittest.main()
