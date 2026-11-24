#!/usr/bin/env python3
"""Paid performance agent for the Paid Performance Assessment workbook.

Reads Meta (daily and weekly by ad), Google (daily by campaign), PostHog trial signups and the change log.
Writes one report for the dashboard.

KPIs: spend, clicks, trials, cost per trial, click-to-trial rate. The workbook has no paying-customer data,
so none is reported.

Two trial sources, and why:
- Channel totals use PostHog trial signups by utm_source (facebook = Meta, google = Google). PostHog is first-party
  and counts every signup, so it is the primary number.
- Campaign and creative breakdowns use platform-reported trials (Meta reported, Google conversions). PostHog has no
  campaign or ad field, so these numbers rank items inside a platform; they do not add up to the channel total.
The gap between the two is reported for each platform.

Rules-based on purpose. Verdicts and recommendations are prompts for a human, not decisions.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data" / "Paid_Performance_Assessment_Data.xlsx"
DEFAULT_MAP = ROOT / "data" / "ad_name_map.csv"
DEFAULT_OUTPUT = ROOT / "data" / "paid-report.js"

FREQ_RISE = 0.15          # frequency up 15%+ week over week
C2T_DROP = 0.15           # click-to-trial down 15%+ week over week
MIN_TRIALS = 10           # below this an ad is too small to judge
PAUSE_INDEX = 1.5
REFRESH_INDEX = 1.2
SCALE_INDEX = 0.85
CHANGE_WINDOW_DAYS = 14   # before and after window for change-log comparisons

AUDIENCE = {
    "Prospecting_AdvantagePlus": "Advantage+ prospecting",
    "Prospecting_Broad": "Broad prospecting",
    "Retargeting_30d": "Retargeting, 30 days",
}
GOOGLE_TYPE = {
    "Search_Brand_US": "Brand search (US)",
    "Search_NonBrand_US": "Non-brand search (US)",
    "Search_NonBrand_UK": "Non-brand search (UK)",
    "PMax_US": "Performance Max (US)",
}
PH_SOURCE = {"Meta": "facebook", "Google": "google"}

FORMULAS = [
    {"name": "Cost per trial", "formula": "Spend ÷ Trials"},
    {"name": "Click-to-trial rate", "formula": "Trials ÷ Clicks"},
    {"name": "CTR (click-through rate)", "formula": "Clicks ÷ Impressions"},
    {"name": "Trial source (channel totals)", "formula": "PostHog trial signups by utm_source: facebook for Meta, google for Google"},
    {"name": "Trial source (campaign and creative)", "formula": "Platform-reported trials: Meta reported, Google conversions"},
]


def read_sheet(wb, name):
    rows = list(wb[name].iter_rows(values_only=True))
    hdr = rows[0]
    return [dict(zip(hdr, r)) for r in rows[1:] if any(v not in (None, "") for v in r)]


def as_date(v):
    return v.date() if isinstance(v, datetime) else v


def week_start(d):
    d = as_date(d)
    return (d - timedelta(days=d.weekday())).isoformat()


def ratio(a, b, nd=4):
    return round(a / b, nd) if b else None


def pct_change(new, old):
    if new is None or old in (None, 0):
        return None
    return round((new - old) / old, 4)


def totals(spend, clicks, trials):
    return {
        "spend": round(spend, 2),
        "clicks": round(clicks),
        "trials": round(trials),
        "cost_per_trial": ratio(spend, trials, 2),
        "click_to_trial": ratio(trials, clicks),
    }


def load(path: Path, map_path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)
    data = {n: read_sheet(wb, n) for n in ("Meta_Daily", "Meta_Ads_Weekly", "Google_Daily", "Trials_PostHog", "Change_Log")}
    with map_path.open(newline="") as f:
        mapping = {r["ad_name"]: r for r in csv.DictReader(f)}
    return data, mapping


def build(data: dict, mapping: dict) -> dict:
    md, ma = data["Meta_Daily"], data["Meta_Ads_Weekly"]
    gd, ph, cl = data["Google_Daily"], data["Trials_PostHog"], data["Change_Log"]

    all_dates = [as_date(r["Date"]) for r in md + gd + ph]
    start, end = min(all_dates), max(all_dates)
    days = (end - start).days + 1
    weeks = sorted({week_start(d) for d in all_dates})

    # ---- Channel totals (primary trials = PostHog) ----
    ph_src = defaultdict(float)
    for r in ph:
        ph_src[r["Source (utm_source)"]] += r["Trial signups"]
    meta_spend = sum(r["Spend ($)"] for r in md)
    meta_clicks = sum(r["Clicks"] for r in md)
    meta_rep = sum(r["Trials (Meta reported)"] for r in md)
    goo_spend = sum(r["Spend ($)"] for r in gd)
    goo_clicks = sum(r["Clicks"] for r in gd)
    all_impr = sum(r["Impressions"] for r in md) + sum(r["Impressions"] for r in gd)
    goo_rep = sum(r["Conversions (Google reported)"] for r in gd)

    meta_ch = totals(meta_spend, meta_clicks, ph_src["facebook"])
    goo_ch = totals(goo_spend, goo_clicks, ph_src["google"])
    paid = totals(meta_spend + goo_spend, meta_clicks + goo_clicks, ph_src["facebook"] + ph_src["google"])
    total_signups = sum(ph_src.values())
    unattributed = total_signups - paid["trials"]

    platforms = [
        {"platform": "Meta", **meta_ch, "trials_platform": round(meta_rep),
         "gap_pct": pct_change(meta_rep, ph_src["facebook"]), "share_of_spend": ratio(meta_spend, paid["spend"])},
        {"platform": "Google", **goo_ch, "trials_platform": round(goo_rep),
         "gap_pct": pct_change(goo_rep, ph_src["google"]), "share_of_spend": ratio(goo_spend, paid["spend"])},
    ]

    # ---- Campaigns (platform-reported trials) ----
    camp = defaultdict(lambda: defaultdict(float))
    for r in md:
        k = ("Meta", r["Campaign"])
        camp[k]["spend"] += r["Spend ($)"]
        camp[k]["clicks"] += r["Clicks"]
        camp[k]["trials"] += r["Trials (Meta reported)"]
    for r in gd:
        k = ("Google", r["Campaign"])
        camp[k]["spend"] += r["Spend ($)"]
        camp[k]["clicks"] += r["Clicks"]
        camp[k]["trials"] += r["Conversions (Google reported)"]
    campaigns = []
    for (plat, name), t in camp.items():
        c = totals(t["spend"], t["clicks"], t["trials"])
        campaigns.append({
            "platform": plat, "campaign": name,
            "type": AUDIENCE.get(name) or GOOGLE_TYPE.get(name, name),
            "share_of_spend": ratio(t["spend"], paid["spend"]), **c,
        })
    campaigns.sort(key=lambda c: (c["cost_per_trial"] is None, c["cost_per_trial"] or 0))

    # ---- Creatives: Meta ads, weekly ----
    ads = defaultdict(list)
    for r in ma:
        ads[r["Ad name"]].append(r)
    meta_bench_cpt = ratio(sum(r["Spend ($)"] for r in ma), sum(r["Trials (Meta reported)"] for r in ma), 2)
    alerted = set()
    scorecard = []
    for name, rs in ads.items():
        rs.sort(key=lambda r: r["Week starting"])
        spend = sum(r["Spend ($)"] for r in rs)
        clicks = sum(r["Clicks"] for r in rs)
        trials = sum(r["Trials (Meta reported)"] for r in rs)
        impr = sum(r["Impressions"] for r in rs)
        c = totals(spend, clicks, trials)

        # Alert: frequency up and click-to-trial down, latest week vs prior week.
        weekly = []
        for r in rs:
            c2t = ratio(r["Trials (Meta reported)"], r["Clicks"])
            weekly.append({"week": week_start(r["Week starting"]), "frequency": r["Frequency"], "c2t": c2t,
                           "spend": r["Spend ($)"], "trials": r["Trials (Meta reported)"]})
        f_chg = pct_change(weekly[-1]["frequency"], weekly[-2]["frequency"]) if len(weekly) > 1 else None
        c_chg = pct_change(weekly[-1]["c2t"], weekly[-2]["c2t"]) if len(weekly) > 1 else None
        fatigue = f_chg is not None and c_chg is not None and f_chg >= FREQ_RISE and c_chg <= -C2T_DROP
        if fatigue:
            alerted.add(name)

        # Cost per trial trend over the last two weeks against the two before.
        last2 = [w for w in weekly[-2:]]
        prev2 = [w for w in weekly[-4:-2]] if len(weekly) >= 4 else []
        cpt_last = ratio(sum(w["spend"] for w in last2), sum(w["trials"] for w in last2), 2)
        cpt_prev = ratio(sum(w["spend"] for w in prev2), sum(w["trials"] for w in prev2), 2) if prev2 else None
        cpt_trend = pct_change(cpt_last, cpt_prev)

        idx = round(c["cost_per_trial"] / meta_bench_cpt, 2) if c["cost_per_trial"] and meta_bench_cpt else None
        active = [w for w in weekly if w["spend"] > 0]
        last_active = active[-1] if active else weekly[-1]
        freq = last_active["frequency"]
        paused = weekly[-1]["spend"] == 0
        m = mapping.get(name)
        concept = m["concept"] if m else "Unmapped"

        if paused:
            verdict, reason = "Paused", f"No spend in the latest week. Last active week {last_active['week']}, frequency {freq:.2f}."
        elif trials < MIN_TRIALS:
            verdict, reason = "Too little data", f"Only {round(trials)} trials since launch."
        elif idx is not None and idx > PAUSE_INDEX and cpt_trend is not None and cpt_trend > 0.10:
            verdict, reason = "Pause", f"Cost per trial is {idx:.2f}x the Meta benchmark and rose {cpt_trend * 100:.0f}% over the last two weeks."
        elif fatigue:
            verdict, reason = "Refresh", f"Fatigue: frequency {f_chg * 100:+.0f}% and click-to-trial {c_chg * 100:+.0f}% week over week."
        elif idx is not None and idx > REFRESH_INDEX:
            verdict, reason = "Refresh", f"Cost per trial is {idx:.2f}x the Meta benchmark."
        elif idx is not None and idx < SCALE_INDEX and freq < 3:
            verdict, reason = "Scale", f"Cost per trial is {idx:.2f}x the Meta benchmark at frequency {freq:.2f}."
        else:
            verdict, reason = "Keep", "Within range of the Meta benchmark."

        scorecard.append({
            "value": name, "platform": "Meta", "campaign": rs[-1]["Campaign"],
            "concept": concept, "hook": m["hook"] if m else "", "format": m["format"] if m else "",
            "audience": AUDIENCE.get(rs[-1]["Campaign"], rs[-1]["Campaign"]),
            "launched": as_date(rs[-1]["Ad launched"]).isoformat(), "weeks": len(rs),
            "spend": c["spend"], "clicks": c["clicks"], "trials": c["trials"],
            "impressions": round(impr), "ctr": ratio(clicks, impr),
            "cost_per_trial": c["cost_per_trial"], "click_to_trial": c["click_to_trial"],
            "index": idx, "frequency": freq, "cpt_trend": cpt_trend,
            "verdict": verdict, "reason": reason, "weekly": weekly,
        })
    order = {"Pause": 0, "Refresh": 1, "Scale": 2, "Keep": 3, "Too little data": 4, "Paused": 5}
    scorecard.sort(key=lambda s: (order[s["verdict"]], -s["spend"]))

    # ---- Concepts: Meta creative concepts and Google campaign types ----
    cgroups = defaultdict(lambda: defaultdict(float))
    cads = defaultdict(set)
    for s in scorecard:
        k = ("Meta", s["concept"])
        cgroups[k]["spend"] += s["spend"]
        cgroups[k]["clicks"] += s["clicks"]
        cgroups[k]["trials"] += s["trials"]
        cads[k].add(s["value"])
    for (plat, name), t in camp.items():
        if plat == "Google":
            k = ("Google", GOOGLE_TYPE.get(name, name))
            cgroups[k]["spend"] += t["spend"]
            cgroups[k]["clicks"] += t["clicks"]
            cgroups[k]["trials"] += t["trials"]
            cads[k].add(name)
    concepts = []
    base = meta_bench_cpt
    for (plat, name), t in cgroups.items():
        c = totals(t["spend"], t["clicks"], t["trials"])
        bench = base if plat == "Meta" else ratio(goo_spend, goo_rep, 2)
        idx = round(c["cost_per_trial"] / bench, 2) if c["cost_per_trial"] and bench else None
        concepts.append({"platform": plat, "concept": name, "ads": len(cads[(plat, name)]),
                         "index": idx, **c})
    concepts.sort(key=lambda e: (e["cost_per_trial"] is None, e["cost_per_trial"] or 0))

    # ---- Weekly trend (channel level, PostHog trials) ----
    wk = defaultdict(lambda: defaultdict(float))
    for r in md:
        w = week_start(r["Date"])
        wk[w]["meta_spend"] += r["Spend ($)"]
        wk[w]["meta_clicks"] += r["Clicks"]
        wk[w]["meta_impr"] += r["Impressions"]
    for r in gd:
        w = week_start(r["Date"])
        wk[w]["google_spend"] += r["Spend ($)"]
        wk[w]["google_clicks"] += r["Clicks"]
        wk[w]["google_impr"] += r["Impressions"]
    for r in ph:
        w = week_start(r["Date"])
        if r["Source (utm_source)"] == "facebook":
            wk[w]["meta_trials"] += r["Trial signups"]
        elif r["Source (utm_source)"] == "google":
            wk[w]["google_trials"] += r["Trial signups"]
    trend = []
    for w in weeks:
        t = wk[w]
        spend = t["meta_spend"] + t["google_spend"]
        clicks = t["meta_clicks"] + t["google_clicks"]
        trials = t["meta_trials"] + t["google_trials"]
        trend.append({
            "week": w, "spend": round(spend, 2), "clicks": round(clicks), "trials": round(trials),
            "cost_per_trial": ratio(spend, trials, 2), "click_to_trial": ratio(trials, clicks),
            "meta_cost_per_trial": ratio(t["meta_spend"], t["meta_trials"], 2),
            "google_cost_per_trial": ratio(t["google_spend"], t["google_trials"], 2),
            "meta_click_to_trial": ratio(t["meta_trials"], t["meta_clicks"]),
            "google_click_to_trial": ratio(t["google_trials"], t["google_clicks"]),
            "meta_ctr": ratio(t["meta_clicks"], t["meta_impr"]),
            "google_ctr": ratio(t["google_clicks"], t["google_impr"]),
        })

    # ---- One-line insight and action for each trend chart, computed from the weekly values ----
    def chart_note(key_m, key_g, name, bad_if_up):
        def avg(vals):
            vals = [v for v in vals if v is not None]
            return sum(vals) / len(vals) if vals else None
        def fmtv(v):
            if v is None:
                return "n/a"
            return f"${v:.2f}" if name.startswith("cost") else f"{v * 100:.2f}%"
        m = [t[key_m] for t in trend]
        g = [t[key_g] for t in trend]
        out = {}
        for plat, series in (("Meta", m), ("Google", g)):
            last = series[-1]
            base = avg(series[-5:-1])
            out[plat] = {"latest": last, "base": base, "chg": pct_change(last, base) if last and base else None}
        mc, gc = out["Meta"]["chg"], out["Google"]["chg"]
        def word(c):
            if c is None:
                return "no comparison"
            return f"{'up' if c >= 0 else 'down'} {abs(c) * 100:.0f}%"
        insight = (f"Meta {fmtv(out['Meta']['latest'])} latest week, {word(mc)} vs its prior 4-week average; "
                   f"Google {fmtv(out['Google']['latest'])}, {word(gc)}.")
        worse = [c for c in (mc, gc) if c is not None and ((c > 0.10) if bad_if_up else (c < -0.10))]
        if worse:
            reco = (f"Review the creatives flagged in the scorecard before adding budget; "
                    f"{name} moved more than 10% the wrong way.")
        else:
            reco = "No change. Both platforms are within 10% of their recent average."
        return {"insight": insight, "reco": reco}

    chart_notes = {
        "cost_per_trial": chart_note("meta_cost_per_trial", "google_cost_per_trial", "cost per trial", True),
        "click_to_trial": chart_note("meta_click_to_trial", "google_click_to_trial", "click-to-trial", False),
        "ctr": chart_note("meta_ctr", "google_ctr", "CTR", False),
    }

    # ---- Change log: paid cost per trial before and after each change (not a controlled test) ----
    daily = defaultdict(lambda: defaultdict(float))
    for r in md:
        d = as_date(r["Date"])
        daily[d]["spend"] += r["Spend ($)"]
        daily[d]["clicks"] += r["Clicks"]
    for r in gd:
        d = as_date(r["Date"])
        daily[d]["spend"] += r["Spend ($)"]
        daily[d]["clicks"] += r["Clicks"]
    for r in ph:
        if r["Source (utm_source)"] in ("facebook", "google"):
            daily[as_date(r["Date"])]["trials"] += r["Trial signups"]

    def window_cpt(a, b):
        sel = [daily[d] for d in daily if a <= d < b]
        s = sum(x["spend"] for x in sel)
        t = sum(x["trials"] for x in sel)
        return ratio(s, t, 2), len(sel)

    changes = []
    for r in cl:
        d = as_date(r["Date"])
        before, nb = window_cpt(d - timedelta(days=CHANGE_WINDOW_DAYS), d)
        after, na = window_cpt(d, d + timedelta(days=CHANGE_WINDOW_DAYS))
        changes.append({
            "date": d.isoformat(), "change": r["Change"], "owner": r["Owner"],
            "cost_per_trial_before": before, "cost_per_trial_after": after,
            "days_before": nb, "days_after": na,
            "partial": na < CHANGE_WINDOW_DAYS or nb < CHANGE_WINDOW_DAYS,
            "change_pct": pct_change(after, before),
        })
    changes.sort(key=lambda c: c["date"], reverse=True)

    # ---- Tag families for the bar charts (Meta creatives only) ----
    def fam(dim):
        agg = defaultdict(lambda: defaultdict(float))
        for s in scorecard:
            if s[dim]:
                agg[s[dim]]["spend"] += s["spend"]
                agg[s[dim]]["clicks"] += s["clicks"]
                agg[s[dim]]["trials"] += s["trials"]
        out = []
        for v, t in agg.items():
            c = totals(t["spend"], t["clicks"], t["trials"])
            out.append({"value": v, **c})
        return sorted(out, key=lambda e: (e["cost_per_trial"] is None, e["cost_per_trial"] or 0))
    tags = {"concept": fam("concept"), "hook": fam("hook"), "format": fam("format")}

    # ---- Alerts ----
    alerts = [{
        "dimension": "ad_name", "value": s["value"],
        "frequency": {"prior": s["weekly"][-2]["frequency"], "latest": s["weekly"][-1]["frequency"]},
        "click_to_trial": {"prior": s["weekly"][-2]["c2t"], "latest": s["weekly"][-1]["c2t"]},
        "message": f"{s['value']}: {s['reason']}",
    } for s in scorecard if s["value"] in alerted]

    # ---- Naming and data quality ----
    parse_errors = []
    for name in ads:
        if name not in mapping:
            parse_errors.append({"ad_name": name, "problem": "Not in the proposed name map. Needs a concept, hook, format and variant."})
        elif mapping[name]["status"] != "proposed":
            parse_errors.append({"ad_name": name, "problem": f"Mapping status is '{mapping[name]['status']}'. Confirm the format before trusting this ad's breakdown."})
    clicks_meta_weekly = sum(r["Clicks"] for r in ma)
    data_quality = [
        {"title": "No Google ad groups", "text": f"The workbook has {len({r['Campaign'] for r in gd})} Google campaigns and no ad-group or ad-level rows, so Google has no creative breakdown."},
        {"title": "Meta clicks do not match", "text": f"Meta daily clicks total {round(meta_clicks):,}; weekly ad clicks total {round(clicks_meta_weekly):,} "
                                                     f"({pct_change(clicks_meta_weekly, meta_clicks) * 100:+.1f}%). Campaign clicks use the daily sheet; creative clicks use the weekly sheet."},
        {"title": "Meta trials do not match PostHog", "text": f"Meta reports {round(meta_rep)} trials; PostHog attributes {round(ph_src['facebook'])} to facebook "
                                                             f"({pct_change(ph_src['facebook'], meta_rep) * 100:+.1f}%). Channel totals use PostHog."},
        {"title": "Google trials are close to PostHog", "text": f"Google reports {round(goo_rep)} conversions; PostHog attributes {round(ph_src['google'])} to google."},
        {"title": "Unattributed signups", "text": f"{round(unattributed):,} of {round(total_signups):,} signups ({ratio(unattributed, total_signups) * 100:.0f}%) came from organic or direct, outside paid cost per trial."},
    ]

    # ---- Insights and recommendations (computed from the numbers above) ----
    insights = [
        {"title": "Paid cost per trial", "text": f"Paid cost per trial is ${paid['cost_per_trial']:.2f} across ${paid['spend']:,.0f} spend and {paid['trials']} PostHog trials."},
        {"title": "Click-to-trial rate", "text": f"Paid click-to-trial is {paid['click_to_trial'] * 100:.2f}%: Google {goo_ch['click_to_trial'] * 100:.2f}%, Meta {meta_ch['click_to_trial'] * 100:.2f}%."},
        {"title": "Channel cost per trial", "text": f"Meta ${meta_ch['cost_per_trial']:.2f} per trial, Google ${goo_ch['cost_per_trial']:.2f} per trial."},
    ]
    if scorecard:
        best = min((s for s in scorecard if s["cost_per_trial"] and s["trials"] >= MIN_TRIALS), key=lambda s: s["cost_per_trial"])
        insights.append({"title": "Best Meta creative on cost", "text": f"{best['value']} runs at ${best['cost_per_trial']:.2f} per trial ({best['trials']} trials)."})
    for s in scorecard:
        if s["verdict"] == "Paused":
            act = [w for w in s["weekly"] if w["spend"] > 0]
            first, last = act[0], act[-1]
            text = f"Paused after {last['week']} at frequency {last['frequency']:.2f}."
            if first["c2t"] and last["c2t"]:
                text += f" Click-to-trial went from {first['c2t'] * 100:.2f}% to {last['c2t'] * 100:.2f}% over its active weeks, so the fatigue rule did not fire."
            insights.append({"title": f"Paused: {s['value']}", "text": text})

    recs = []
    for g in campaigns:
        if g["platform"] == "Google" and g["spend"] > 0 and g["trials"] == 0:
            recs.append({"priority": "high", "title": f"Check tracking on {g['campaign']} before more spend",
                         "action": "Confirm conversion tracking and the landing path for this campaign. Pause or cap it until a trial is tracked.",
                         "why": f"${g['spend']:,.0f} spend with 0 Google conversions over {days} days."})
    for s in scorecard:
        if s["verdict"] == "Pause":
            recs.append({"priority": "high", "title": f"Pause {s['value']}", "action": "Stop new spend and move budget to the best-performing concept.", "why": s["reason"]})
        elif s["verdict"] == "Refresh":
            recs.append({"priority": "medium", "title": f"Refresh {s['value']}", "action": "Brief a new version that keeps the hook and format. Test it on the same audience.", "why": s["reason"]})
        elif s["verdict"] == "Scale":
            recs.append({"priority": "low", "title": f"Scale {s['value']} in steps", "action": "Raise budget 10 to 15% a week and watch frequency.", "why": s["reason"]})
    recs.append({"priority": "high", "title": "Agree one trial number before reporting cost per trial",
                 "action": "Pick PostHog or platform-reported trials as the reporting source, and fix the attribution gap.",
                 "why": f"Meta reports {round(meta_rep)} trials, PostHog {round(ph_src['facebook'])}."})
    recs.append({"priority": "medium", "title": "Adopt the naming convention on new ads",
                 "action": "Confirm the proposed concept, hook, format and variant map, then block launches whose names do not pass the check.",
                 "why": f"{len(ads)} Meta ads and {len({r['Campaign'] for r in gd})} Google campaigns do not follow CONCEPT_HOOK_FORMAT_AUDIENCE_VARIANT."})
    order_p = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: order_p[r["priority"]])

    return {
        "window": {"from": start.isoformat(), "to": end.isoformat(), "days": days, "weeks": len(weeks),
                   "benchmark": {**paid, "impressions": round(all_impr), "ctr": ratio(paid["clicks"], all_impr), "unattributed_trials": round(unattributed), "total_signups": round(total_signups)}},
        "latest_week": weeks[-1],
        "benchmarks": {
            "meta": {"cost_per_trial": meta_bench_cpt,
                     "basis": "Meta-reported trials and spend from the weekly ad sheet, all Meta ads combined"},
            "google": {"cost_per_trial": ratio(goo_spend, goo_rep, 2),
                       "basis": "Google spend divided by Google-reported conversions, all Google campaigns combined"},
        },
        "formulas": FORMULAS,
        "platforms": platforms,
        "campaigns": campaigns,
        "concepts": concepts,
        "scorecard": scorecard,
        "trend": trend,
        "chart_notes": chart_notes,
        "tags": tags,
        "changes": changes,
        "alerts": alerts,
        "insights": insights,
        "recommendations": recs,
        "data_quality": data_quality,
        "parse_errors": parse_errors,
        "scope": "Built from the Paid Performance Assessment workbook. Trials are PostHog signups for channel totals and platform-reported for creatives and campaigns. No paying-customer data.",
    }


def write_js(report: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window.REPORT_DATA = " + json.dumps(report, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--map", type=Path, default=DEFAULT_MAP)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = ap.parse_args()

    data, mapping = load(args.input, args.map)
    report = build(data, mapping)
    write_js(report, args.output)
    b = report["window"]["benchmark"]
    print(f"Window {report['window']['from']}..{report['window']['to']} ({report['window']['days']} days) | "
          f"spend ${b['spend']:,.0f} | trials {b['trials']} | cost per trial ${b['cost_per_trial']:.2f} | "
          f"alerts {len(report['alerts'])} | data notes {len(report['data_quality'])}")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
