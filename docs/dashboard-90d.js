(function () {
  "use strict";

  const R = window.REPORT_DATA;
  const NS = "http://www.w3.org/2000/svg";
  const W = R.window;
  const B = W.benchmark;

  // Readable names for the concept IDs used in ad names (CamelCase cannot contain spaces).
  const CONCEPT_LABELS = {
    AISearchVisibility: "AI search visibility",
    SEOAutomation: "On-page and technical SEO automation",
    AgencyUseCase: "Agency use case",
    LocalSMB: "Local or small-business use case",
    AdsUseCase: "Ads use case",
    ComparisonAlt: "Comparison and alternatives",
    Brand: "Brand",
    UGC: "UGC",
    FounderStory: "Founder story",
    Screenshots: "Screenshots",
  };
  const label = c => CONCEPT_LABELS[c] || c;

  const fmt = {
    pct: v => (v == null ? "–" : (v * 100).toFixed(2) + "%"),
    num: v => (v == null ? "–" : v.toFixed(2)),
    money: v => (v == null ? "–" : "$" + v.toLocaleString("en-CA", { maximumFractionDigits: 2 })),
    money0: v => (v == null ? "–" : "$" + Math.round(v).toLocaleString("en-CA")),
    int: v => (v == null ? "–" : Math.round(v).toLocaleString("en-CA")),
    delta: v => (v == null ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"),
    index: v => (v == null ? "–" : v.toFixed(2) + "x"),
  };

  // Build elements with textContent only, never innerHTML, so names from data cannot inject markup.
  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  function svg(tag, attrs, ...kids) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    for (const kid of kids.flat()) {
      if (kid == null) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  // Higher is bad for frequency and CPA; higher is good for click-to-trial.
  const badIfUp = v => (v == null ? "" : v > 0 ? "bad" : "good");
  // Index above 1 means more expensive than the benchmark.
  const badIfIndexUp = v => (v == null ? "" : v > 1 ? "bad" : "good");

  function table(head, body, cls) {
    return h("div", { class: "table-wrap" },
      h("table", { class: cls || "" },
        h("thead", {}, h("tr", {}, head.map(t => h("th", { text: t })))),
        h("tbody", {}, body)));
  }

  function renderHeader() {
    document.getElementById("window").textContent =
      `${W.weeks} weeks (${W.from} to ${W.to}) · latest week ${R.latest_week} · benchmark = all creatives combined`;
  }

  function renderKpis() {
    const cards = [
      ["CPA (trial CPA), 90 days", fmt.money(B.trial_cpa), true],
      ["Click-to-trial, 90 days", fmt.pct(B.click_to_trial), true],
      ["CTR, 90 days", fmt.pct(B.ctr), true],
      ["Spend, 90 days", fmt.money0(B.spend)],
    ];
    document.getElementById("kpis").replaceChildren(...cards.map(([name, value, primary]) =>
      h("div", { class: primary ? "card card-primary" : "card" },
        h("div", { class: "card-label", text: name }),
        h("div", { class: "card-value", text: String(value) }))));
  }

  function renderFormulas() {
    const cpa = `${fmt.money0(B.spend)} ÷ ${fmt.int(B.trials)} trials = ${fmt.money(B.trial_cpa)}`;
    const c2t = `${fmt.int(B.trials)} trials ÷ ${fmt.int(B.clicks)} clicks = ${fmt.pct(B.click_to_trial)}`;
    const ctr = `${fmt.int(B.clicks)} clicks ÷ ${fmt.int(B.impressions)} impressions = ${fmt.pct(B.ctr)}`;
    document.getElementById("formulas").replaceChildren(
      h("details", { class: "calc" },
        h("summary", { text: "How the numbers are calculated (click to expand)" }),
        h("ul", { class: "formulas" }, R.formulas.map(f =>
          h("li", {}, h("strong", { text: f.name + ": " }), f.formula))),
        h("p", { class: "example", text: "CPA, 90 days: " + cpa }),
        h("p", { class: "example", text: "Click-to-trial, 90 days: " + c2t }),
        h("p", { class: "example", text: "CTR, 90 days: " + ctr })));
  }

  function renderScorecard() {
    const head = ["Creative", "Platform · campaign", "Concept", "Spend", "Trials", "Trial CPA", "Index", "Click-to-trial", "Frequency", "CPA trend, last 3 wks", "Verdict", "Why"];
    const pill = v => h("span", { class: "pill pill-" + v.toLowerCase().replace(/ /g, "-"), text: v });
    const body = R.scorecard.map(s => h("tr", {},
      h("td", { class: "tag", text: s.value }),
      h("td", { class: "tags", text: s.platform + " · " + s.campaign }),
      h("td", { class: "tags", text: label(s.tags.concept) }),
      h("td", { text: fmt.money0(s.spend) }),
      h("td", { text: fmt.int(s.trials) }),
      h("td", { class: "strong", text: fmt.money(s.trial_cpa) }),
      h("td", { class: badIfIndexUp(s.index), text: fmt.index(s.index) }),
      h("td", { text: fmt.pct(s.click_to_trial) }),
      h("td", { text: fmt.num(s.frequency) }),
      h("td", { class: badIfUp(s.cpa_trend_3w), text: fmt.delta(s.cpa_trend_3w) }),
      h("td", {}, pill(s.verdict)),
      h("td", { class: "why", text: s.reason })));
    document.getElementById("scorecard").replaceChildren(table(head, body));
  }

  function renderPlatforms() {
    const head = ["Platform", "Ads", "Spend", "Share of spend", "Trials", "Trial CPA", "Index"];
    const body = R.platforms.map(p => h("tr", {},
      h("td", { class: "tag", text: p.platform }),
      h("td", { text: fmt.int(p.ads) }),
      h("td", { text: fmt.money0(p.spend) }),
      h("td", { text: fmt.pct(p.share_of_spend) }),
      h("td", { text: fmt.int(p.trials) }),
      h("td", { class: "strong", text: fmt.money(p.trial_cpa) }),
      h("td", { class: badIfIndexUp(p.index), text: fmt.index(p.index) })));
    const campaigns = R.campaigns.map(c => h("tr", {},
      h("td", { class: "tag", text: c.platform + " · " + c.campaign }),
      h("td", { text: fmt.int(c.ads) }),
      h("td", { text: fmt.money0(c.spend) }),
      h("td", { text: fmt.pct(c.share_of_spend) }),
      h("td", { text: fmt.int(c.trials) }),
      h("td", { class: "strong", text: fmt.money(c.trial_cpa) }),
      h("td", { class: badIfIndexUp(c.index), text: fmt.index(c.index) })));
    document.getElementById("platforms").replaceChildren(
      h("h3", { text: "By platform" }),
      table(head, body),
      h("h3", { text: "By campaign" }),
      table(["Campaign", "Ads", "Spend", "Share of spend", "Trials", "Trial CPA", "Index"], campaigns));
  }

  function renderConcepts() {
    const head = ["Platform", "Concept (ad group or creative type)", "Ads", "Spend", "Trials", "Trial CPA", "Index"];
    const body = R.concepts.map(c => h("tr", {},
      h("td", { class: "tag", text: c.platform }),
      h("td", { class: "tags", text: label(c.concept) }),
      h("td", { text: fmt.int(c.ads) }),
      h("td", { text: fmt.money0(c.spend) }),
      h("td", { text: fmt.int(c.trials) }),
      h("td", { class: "strong", text: fmt.money(c.trial_cpa) }),
      h("td", { class: badIfIndexUp(c.index), text: fmt.index(c.index) })));
    document.getElementById("concepts").replaceChildren(table(head, body));
  }

  // Line chart; null points are skipped.
  function lineChart(title, points, fmtY) {
    const VW = 640, VH = 220, L = 70, RM = 16, T = 16, B2 = 34;
    const vals = points.map(p => p.y).filter(v => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const x = i => L + (points.length === 1 ? (VW - L - RM) / 2 : i * (VW - L - RM) / (points.length - 1));
    const y = v => T + (VH - T - B2) * (1 - (v - lo) / span);
    const pts = points.map((p, i) => p.y == null ? null : [x(i), y(p.y)]).filter(Boolean);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const ticks = [lo, lo + span / 2, hi];
    return h("div", { class: "chart-card" },
      h("h3", { text: title }),
      svg("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": title },
        ticks.map(t => svg("g", {},
          svg("line", { class: "axis", x1: L, x2: VW - RM, y1: y(t), y2: y(t) }),
          svg("text", { class: "tick", x: L - 8, y: y(t) + 4, "text-anchor": "end" }, fmtY(t)))),
        svg("path", { class: "line", d }),
        pts.map(p => svg("circle", { class: "dot", cx: p[0], cy: p[1], r: 3 })),
        points.map((p, i) => (i % 2 === 0 || points.length < 8)
          ? svg("text", { class: "tick", x: x(i), y: VH - 10, "text-anchor": "middle" }, p.x.slice(5))
          : null)));
  }

  // Horizontal bars; lowest value green, highest red.
  function barChart(title, items, fmtV, height) {
    const VW = 640, rowH = height || 24, RM = 80, T = 8;
    const longest = Math.max(0, ...items.map(i => String(i.label).length));
    const L = Math.min(340, Math.max(110, longest * 6.8 + 16));
    const VH = T + items.length * rowH + 6;
    const vals = items.map(i => i.value).filter(v => v != null);
    const max = Math.max(...vals) || 1, lo = Math.min(...vals), hi = Math.max(...vals);
    const cls = v => (v === lo ? "bar-best" : v === hi ? "bar-worst" : "bar");
    return h("div", { class: "chart-card" },
      h("h3", { text: title }),
      svg("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": title },
        items.map((it, i) => {
          const yy = T + i * rowH;
          const w = (VW - L - RM) * ((it.value || 0) / max);
          return svg("g", {},
            svg("text", { class: "lbl", x: L - 8, y: yy + 16, "text-anchor": "end" }, it.label),
            svg("rect", { class: cls(it.value), x: L, y: yy + 4, width: Math.max(w, 1), height: rowH - 9, rx: 3 }),
            svg("text", { class: "val", x: L + w + 6, y: yy + 16 }, fmtV(it.value)));
        })));
  }

  function renderCharts() {
    const tr = R.trend;
    document.getElementById("trend").replaceChildren(
      lineChart("Trial CPA by week", tr.map(t => ({ x: t.week, y: t.trial_cpa })), v => "$" + v.toFixed(2)),
      lineChart("Click-to-trial by week", tr.map(t => ({ x: t.week, y: t.click_to_trial })), v => (v * 100).toFixed(1) + "%"),
      lineChart("CTR by week", tr.map(t => ({ x: t.week, y: t.ctr })), v => (v * 100).toFixed(2) + "%"),
      lineChart("Frequency by week", tr.map(t => ({ x: t.week, y: t.frequency })), v => v.toFixed(2)));

    const conceptItems = R.concepts
      .filter(c => c.trial_cpa != null)
      .map(c => ({ label: c.platform + " · " + label(c.concept), value: c.trial_cpa }));
    document.getElementById("concept-chart").replaceChildren(
      barChart("Trial CPA by concept, 90 days (green = lowest, red = highest)", conceptItems, fmt.money, 26));

    const pick = dim => R.tags_90d[dim].filter(e => e.trial_cpa != null).map(e => ({ label: e.value, value: e.trial_cpa }));
    document.getElementById("tags").replaceChildren(
      barChart("Hook: trial CPA", pick("hook"), fmt.money, 22),
      barChart("Format: trial CPA", pick("format"), fmt.money, 22),
      barChart("Audience: trial CPA", pick("audience"), fmt.money, 22));
  }

  function renderBriefs() {
    const top = R.combos.slice(0, 3);
    const root = document.getElementById("briefs");
    if (!top.length) {
      root.replaceChildren(h("p", { class: "hint", text: "No combination has 40 or more trials yet." }));
      return;
    }
    root.replaceChildren(...top.map((c, i) => h("div", { class: "brief" },
      h("div", { class: "brief-rank", text: "#" + (i + 1) + " combination" }),
      h("div", { class: "brief-title", text: c.label }),
      h("p", { class: "brief-line", text: fmt.money(c.trial_cpa) + " trial CPA · " + fmt.index(c.index) + " benchmark · " + fmt.int(c.trials) + " trials, 90 days" }),
      h("p", { class: "brief-line hint", text: "Next creative: keep this hook, format and audience; vary the opening frame and the first line." }))));
  }

  function renderRecs() {
    document.getElementById("recs").replaceChildren(...R.recommendations.map(r =>
      h("div", { class: "rec rec-" + r.priority },
        h("div", { class: "rec-prio", text: r.priority + " priority" }),
        h("div", { class: "rec-title", text: r.title }),
        h("p", { class: "rec-action", text: r.action }),
        h("p", { class: "rec-why", text: "Why: " + r.why }))));
  }

  function renderAlerts() {
    const root = document.getElementById("alerts");
    if (!R.alerts.length) {
      root.replaceChildren(h("p", { class: "ok", text: "No fatigue flags this week." }));
      return;
    }
    root.replaceChildren(...R.alerts.map(a =>
      h("div", { class: "alert" },
        h("div", { class: "alert-dim", text: a.dimension === "ad_name" ? "Creative" : a.dimension }),
        h("div", { class: "alert-msg", text: a.message }))));
  }

  function renderNotes() {
    const notes = [
      "Mock data, generated by agent/make_mock_data.py. Not connected to any ad platform or to paid-customer records.",
      "Google search has no 3-second view metric, so hook rate is blank for Google rows (not 0%). Hook and format charts mix both platforms; compare within a platform.",
      "Verdicts, indexes and briefs are rule-based (thresholds in agent/creative_report.py), not a model.",
    ];
    const bad = R.parse_errors.map(e => `${e.ad_name} (line ${e.first_line}) breaks the naming convention and is excluded from every number above.`);
    document.getElementById("notes").replaceChildren(
      h("ul", { class: "notes" }, [...notes, ...bad].map(t => h("li", { text: t }))));
  }

  renderHeader();
  renderKpis();
  renderFormulas();
  renderPlatforms();
  renderConcepts();
  renderCharts();
  renderScorecard();
  renderBriefs();
  renderRecs();
  renderAlerts();
  renderNotes();
})();
