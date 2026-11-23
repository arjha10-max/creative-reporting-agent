"""Run with: python3 -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agent"))

from creative_report import build_report, load_rows, parse_ad_name, safe_div  # noqa: E402

DATA = ROOT / "data" / "mock_ads.csv"


class ParseAdName(unittest.TestCase):
    def test_valid_name_splits_into_tags(self):
        tags = parse_ad_name("Cashback_Creator_Video15_GenZ_v1")
        self.assertEqual(tags["concept"], "Cashback")
        self.assertEqual(tags["hook"], "Creator")
        self.assertEqual(tags["format"], "Video15")
        self.assertEqual(tags["audience"], "GenZ")
        self.assertEqual(tags["variant"], "v1")

    def test_variant_can_contain_underscores(self):
        self.assertEqual(parse_ad_name("A_B_C_D_E_F")["variant"], "E_F")

    def test_too_few_parts_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_ad_name("Retargeting_Test")

    def test_empty_tag_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_ad_name("Cashback__Video15_GenZ_v1")


class Metrics(unittest.TestCase):
    def test_safe_div_handles_zero(self):
        self.assertIsNone(safe_div(5, 0))
        self.assertEqual(safe_div(1, 4), 0.25)


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows, errors = load_rows(DATA)
        cls.report = build_report(rows, errors)

    def test_latest_and_prior_weeks(self):
        self.assertEqual(self.report["latest_week"], "2026-W46")
        self.assertEqual(self.report["prior_week"], "2026-W45")

    def test_malformed_name_reported_once(self):
        names = [e["ad_name"] for e in self.report["parse_errors"]]
        self.assertEqual(names, ["Retargeting_Test"])

    def test_planted_fatigue_is_flagged_at_ad_level(self):
        flagged = [a["value"] for a in self.report["alerts"] if a["dimension"] == "ad_name"]
        self.assertEqual(flagged, ["UGC_Problem_Video15_GenZ_v1"])

    def test_healthy_ads_are_not_flagged(self):
        flagged = [a["value"] for a in self.report["alerts"]]
        self.assertNotIn("AISearchVisibility_Keyword_RSA_Marketer_v1", flagged)

    def test_needs_two_weeks(self):
        rows, errors = load_rows(DATA)
        one_week = [r for r in rows if r["week"] == "2026-W46"]
        with self.assertRaises(ValueError):
            build_report(one_week, errors)


if __name__ == "__main__":
    unittest.main()
