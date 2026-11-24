(function () {
  "use strict";

  const R = window.REPORT_DATA;
  const NS = "http://www.w3.org/2000/svg";
  const W = R.window;
  const B = W.benchmark;

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
    for (const kid of kids.flat(Infinity)) {
      if (kid == null) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  function svg(tag, attrs, ...kids) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    for (const kid of kids.flat(Infinity)) {
      if (kid == null) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const badIfUp = v => (v == null ? "" : v > 0 ? "bad" : "good");
  const badIfIndexUp = v => (v == null ? "" : v > 1 ? "bad" : "good");

  function table(head, body) {
    return h("div", { class: "table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {}, head.map(t => h("th", { text: t })))),
        h("tbody", {}, body)));
  }

  // Short month-day label from an ISO date.
  const md = iso => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  };

  function renderHeader() {
    document.getElementById("window").textContent =
      `${md(W.from)} to ${md(W.to)} ${new Date(W.to + "T00:00:00Z").getUTCFullYear()} · ${W.days} days, ${W.weeks} weeks · latest week starts ${R.latest_week} · sources: Meta, Google, PostHog`;
  }

  function renderKpis() {
    const cards = [
      ["CPA (cost per trial)", fmt.money(B.cost_per_trial), true],
      ["Click-to-trial rate", fmt.pct(B.click_to_trial), true],
      ["CTR", fmt.pct(B.ctr), true],
      ["Spend", fmt.money0(B.spend)],
    ];
    document.getElementById("kpis").replaceChildren(...cards.map(([name, value, primary]) =>
      h("div", { class: primary ? "card card-primary" : "card" },
        h("div", { class: "card-label", text: name }),
        h("div", { class: "card-value", text: String(value) }))));
  }

  function renderFormulas() {
    const example = `${fmt.money0(B.spend)} ÷ ${fmt.int(B.trials)} trials = ${fmt.money(B.cost_per_trial)}`;
    const ctr = `${fmt.int(B.trials)} trials ÷ ${fmt.int(B.clicks)} clicks = ${fmt.pct(B.click_to_trial)}`;
    const ctrEx = `${fmt.int(B.clicks)} clicks ÷ ${fmt.int(B.impressions)} impressions = ${fmt.pct(B.ctr)}`;
    document.getElementById("formulas").replaceChildren(
      h("details", { class: "calc" },
        h("summary", { text: "How the numbers are calculated (click to expand)" }),
        h("ul", { class: "formulas" }, R.formulas.map(f => h("li", {}, h("strong", { text: f.name + ": " }), f.formula))),
        h("p", { class: "example", text: "CPA, all paid channels: " + example }),
        h("p", { class: "example", text: "Click-to-trial, all paid channels: " + ctr }),
        h("p", { class: "example", text: "CTR, all paid channels: " + ctrEx }),
        h("p", { class: "note", text: `${fmt.int(B.unattributed_trials)} of ${fmt.int(B.total_signups)} signups (${fmt.pct(B.unattributed_trials / B.total_signups)}) came from organic or direct and are not in CPA.` })));
  }

  function renderPlatforms() {
    const pBody = R.platforms.map(p => h("tr", {},
      h("td", { class: "tag", text: p.platform }),
      h("td", { text: fmt.money0(p.spend) }),
      h("td", { text: fmt.pct(p.share_of_spend) }),
      h("td", { text: fmt.int(p.clicks) }),
      h("td", { text: fmt.int(p.trials) }),
      h("td", { class: "strong", text: fmt.money(p.cost_per_trial) }),
      h("td", { text: fmt.pct(p.click_to_trial) }),
      h("td", { text: fmt.int(p.trials_platform) }),
      h("td", { class: Math.abs(p.gap_pct) > 0.05 ? "bad" : "good", text: fmt.delta(p.gap_pct) })));
    const cBody = R.campaigns.map(c => h("tr", {},
      h("td", { class: "tag", text: c.campaign }),
      h("td", { class: "tags", text: c.platform + " · " + c.type }),
      h("td", { text: fmt.money0(c.spend) }),
      h("td", { text: fmt.pct(c.share_of_spend) }),
      h("td", { text: fmt.int(c.clicks) }),
      h("td", { text: fmt.int(c.trials) }),
      h("td", { class: "strong", text: c.trials ? fmt.money(c.cost_per_trial) : "no trials" }),
      h("td", { text: fmt.pct(c.click_to_trial) })));
    document.getElementById("platforms").replaceChildren(
      h("h3", { text: "By platform (channel totals use PostHog trials)" }),
      table(["Platform", "Spend", "Share of spend", "Clicks", "Trials (PostHog)", "Cost per trial", "Click-to-trial", "Trials, platform-reported", "Platform vs PostHog"], pBody),
      h("h3", { text: "By campaign (trials are platform-reported)" }),
      table(["Campaign", "Platform · type", "Spend", "Share of spend", "Clicks", "Trials", "Cost per trial", "Click-to-trial"], cBody));
  }

  function renderConcepts() {
    const body = R.concepts.map(c => h("tr", {},
      h("td", { class: "tag", text: c.platform }),
      h("td", { class: "tags", text: c.concept }),
      h("td", { text: fmt.int(c.ads) }),
      h("td", { text: fmt.money0(c.spend) }),
      h("td", { text: fmt.int(c.clicks) }),
      h("td", { text: fmt.int(c.trials) }),
      h("td", { class: "strong", text: fmt.money(c.cost_per_trial) }),
      h("td", { text: fmt.pct(c.click_to_trial) }),
      h("td", { class: badIfIndexUp(c.index), text: fmt.index(c.index) })));
    const bm = R.benchmarks;
    const callout = h("div", { class: "callout" },
      h("strong", { text: "What the index compares against (platform benchmark)" }),
      h("p", { text: `Index = concept cost per trial ÷ its platform benchmark. 1.00x is average. Lower is cheaper.` }),
      h("ul", {},
        h("li", { text: `Meta benchmark: ${fmt.money(bm.meta.cost_per_trial)}. ${bm.meta.basis}.` }),
        h("li", { text: `Google benchmark: ${fmt.money(bm.google.cost_per_trial)}. ${bm.google.basis}.` }),
        h("li", { text: "Meta concepts are never compared with Google, and the reverse. Benchmarks use platform-reported trials, so they can differ from the PostHog channel cost per trial above." })));
    document.getElementById("concepts").replaceChildren(
      callout,
      table(["Platform", "Concept (Meta creative concept, or Google campaign type)", "Ads", "Spend", "Clicks", "Trials", "Cost per trial", "Click-to-trial", "Index"], body));

    const items = R.concepts
      .filter(c => c.cost_per_trial != null)
      .map(c => ({ label: c.platform + " · " + c.concept, value: c.cost_per_trial }));
    document.getElementById("concept-chart").replaceChildren(
      barChart("Cost per trial by concept (green = lowest, red = highest)", items, fmt.money, 26));
  }

  // Line chart, one or two series. Null points are skipped.
  function lineChart(title, series, fmtY, legend) {
    const VW = 640, VH = 220, L = 70, RM = 16, T = 16, B2 = 34;
    const all = series.flatMap(s => s.points.map(p => p.y)).filter(v => v != null);
    const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
    const n = series[0].points.length;
    const x = i => L + (n === 1 ? (VW - L - RM) / 2 : i * (VW - L - RM) / (n - 1));
    const y = v => T + (VH - T - B2) * (1 - (v - lo) / span);
    const ticks = [lo, lo + span / 2, hi];
    const plotted = series.map(s => {
      const pts = s.points.map((p, i) => p.y == null ? null : [x(i), y(p.y)]).filter(Boolean);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      return { cls: s.cls, pts, d };
    });
    const labels = series[0].points.map((p, i) => (i % 2 === 0 || n < 8)
      ? svg("text", { class: "tick", x: x(i), y: VH - 10, "text-anchor": "middle" }, md(p.x)) : null);
    return h("div", { class: "chart-card" },
      h("h3", { text: title }),
      legend ? h("p", { class: "legend" },
        h("span", { class: "l-meta" }, h("i"), legend[0]),
        h("span", { class: "l-google" }, h("i"), legend[1])) : null,
      svg("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": title },
        ticks.map(t => svg("g", {},
          svg("line", { class: "axis", x1: L, x2: VW - RM, y1: y(t), y2: y(t) }),
          svg("text", { class: "tick", x: L - 8, y: y(t) + 4, "text-anchor": "end" }, fmtY(t)))),
        plotted.map(p => svg("path", { class: p.cls === "google" ? "line-google" : "line", d: p.d })),
        plotted.map(p => p.pts.map(q => svg("circle", { class: p.cls === "google" ? "dot-google" : "dot", cx: q[0], cy: q[1], r: 3 }))),
        labels));
  }

  // Horizontal bars; lowest value green, highest red.
  function barChart(title, items, fmtV, rowH) {
    const VW = 640, L = 260, RM = 80, T = 8;
    const rh = rowH || 24;
    const VH = T + items.length * rh + 6;
    if (!items.length) return h("div", { class: "chart-card" }, h("h3", { text: title }), h("p", { class: "hint", text: "No data." }));
    const vals = items.map(i => i.value).filter(v => v != null);
    const max = Math.max(...vals) || 1, lo = Math.min(...vals), hi = Math.max(...vals);
    const cls = v => (v === lo ? "bar-best" : v === hi ? "bar-worst" : "bar");
    return h("div", { class: "chart-card" },
      h("h3", { text: title }),
      svg("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": title },
        items.map((it, i) => {
          const yy = T + i * rh;
          const w = (VW - L - RM) * ((it.value || 0) / max);
          return svg("g", {},
            svg("text", { class: "lbl", x: L - 8, y: yy + 16, "text-anchor": "end" }, it.label),
            svg("rect", { class: cls(it.value), x: L, y: yy + 4, width: Math.max(w, 1), height: rh - 9, rx: 3 }),
            svg("text", { class: "val", x: L + w + 6, y: yy + 16 }, fmtV(it.value)));
        })));
  }

  function renderCharts() {
    const tr = R.trend;
    const note = (key, card) => h("div", { class: "chart-wrap" },
      card,
      h("p", { class: "chart-insight", text: "Insight: " + R.chart_notes[key].insight }),
      h("p", { class: "chart-reco", text: "Action: " + R.chart_notes[key].reco }));
    document.getElementById("trend").replaceChildren(
      note("cost_per_trial", lineChart("Cost per trial by week: Meta vs Google", [
        { cls: "meta", points: tr.map(t => ({ x: t.week, y: t.meta_cost_per_trial })) },
        { cls: "google", points: tr.map(t => ({ x: t.week, y: t.google_cost_per_trial })) },
      ], v => "$" + v.toFixed(0), ["Meta", "Google"])),
      note("click_to_trial", lineChart("Click-to-trial rate by week: Meta vs Google", [
        { cls: "meta", points: tr.map(t => ({ x: t.week, y: t.meta_click_to_trial })) },
        { cls: "google", points: tr.map(t => ({ x: t.week, y: t.google_click_to_trial })) },
      ], v => (v * 100).toFixed(2) + "%", ["Meta", "Google"])),
      note("ctr", lineChart("CTR by week: Meta vs Google", [
        { cls: "meta", points: tr.map(t => ({ x: t.week, y: t.meta_ctr })) },
        { cls: "google", points: tr.map(t => ({ x: t.week, y: t.google_ctr })) },
      ], v => (v * 100).toFixed(2) + "%", ["Meta", "Google"])),
    );

    const pick = dim => (R.tags[dim] || []).filter(e => e.cost_per_trial != null).map(e => ({ label: e.value, value: e.cost_per_trial }));
    const campaignItems = R.campaigns.filter(c => c.cost_per_trial != null).map(c => ({ label: c.campaign, value: c.cost_per_trial }));
    document.getElementById("tags").replaceChildren(
      barChart("Hook: cost per trial (Meta)", pick("hook"), fmt.money, 22),
      barChart("Format: cost per trial (Meta)", pick("format"), fmt.money, 22),
      barChart("Campaign: cost per trial (platform-reported)", campaignItems, fmt.money, 22));

    const adBody = R.scorecard.map(s => h("tr", {},
      h("td", { class: "tag", text: s.value }),
      h("td", { class: "tags", text: s.campaign }),
      h("td", { text: s.hook || "–" }),
      h("td", { text: s.format || "–" }),
      h("td", { text: fmt.money0(s.spend) }),
      h("td", { text: fmt.int(s.impressions) }),
      h("td", { text: fmt.pct(s.ctr) }),
      h("td", { text: fmt.pct(s.click_to_trial) }),
      h("td", { class: "strong", text: fmt.money(s.cost_per_trial) })));
    document.getElementById("tags-by-ad").replaceChildren(
      h("h3", { text: "Per ad: CTR, click-to-trial and CPA (cost per trial)" }),
      table(["Ad", "Campaign", "Hook", "Format", "Spend", "Impressions", "CTR", "Click-to-trial", "CPA (cost per trial)"], adBody));
  }

  function renderScorecard() {
    const head = ["Creative", "Campaign", "Concept", "Launched", "Spend", "Trials", "Cost per trial", "Index", "Click-to-trial", "Frequency", "CPA trend, last 2 wks", "Verdict", "Why"];
    const pill = v => h("span", { class: "pill pill-" + v.toLowerCase().replace(/ /g, "-"), text: v });
    const body = R.scorecard.map(s => h("tr", {},
      h("td", { class: "tag", text: s.value }),
      h("td", { class: "tags", text: s.campaign }),
      h("td", { class: "tags", text: s.concept }),
      h("td", { text: s.launched }),
      h("td", { text: fmt.money0(s.spend) }),
      h("td", { text: fmt.int(s.trials) }),
      h("td", { class: "strong", text: fmt.money(s.cost_per_trial) }),
      h("td", { class: badIfIndexUp(s.index), text: fmt.index(s.index) }),
      h("td", { text: fmt.pct(s.click_to_trial) }),
      h("td", { text: fmt.num(s.frequency) }),
      h("td", { class: badIfUp(s.cpt_trend), text: fmt.delta(s.cpt_trend) }),
      h("td", {}, pill(s.verdict)),
      h("td", { class: "why", text: s.reason })));
    document.getElementById("scorecard").replaceChildren(table(head, body));
    document.getElementById("scorecard-note").textContent =
      `Meta creatives only. Index compares each creative with the Meta benchmark of ${fmt.money(R.benchmarks.meta.cost_per_trial)} (platform-reported trials). Google has no ad-group data, so it has no creative rows.`;
  }

  function renderChanges() {
    const body = R.changes.map(c => h("tr", {},
      h("td", { text: c.date }),
      h("td", { text: c.owner }),
      h("td", { class: "why", text: c.change }),
      h("td", { text: fmt.money(c.cost_per_trial_before) }),
      h("td", { text: fmt.money(c.cost_per_trial_after) }),
      h("td", { class: badIfUp(c.change_pct), text: fmt.delta(c.change_pct) }),
      h("td", { class: c.partial ? "muted" : "", text: c.partial ? c.days_after + "d after" : "full window" })));
    document.getElementById("changes").replaceChildren(
      table(["Date", "Owner", "Change", "Cost per trial, 14d before", "Cost per trial, 14d after", "Change", "Window"], body),
      h("p", { class: "note", text: "Before and after windows, not a controlled test. Other changes often overlap, and partial windows are marked." }));
  }

  function renderRecs() {
    document.getElementById("recs").replaceChildren(...R.recommendations.map(r =>
      h("div", { class: "rec rec-" + r.priority },
        h("div", { class: "rec-prio", text: r.priority + " priority" }),
        h("div", { class: "rec-title", text: r.title }),
        h("p", { class: "rec-action", text: r.action }),
        h("p", { class: "rec-why", text: "Why: " + r.why }))));
  }

  function renderInsights() {
    document.getElementById("insights").replaceChildren(...R.insights.map(i =>
      h("div", { class: "brief" },
        h("div", { class: "brief-rank", text: i.title }),
        h("p", { class: "brief-line", text: i.text }))));
  }

  function renderAlerts() {
    const root = document.getElementById("alerts");
    if (!R.alerts.length) {
      root.replaceChildren(h("p", { class: "ok", text: "No fatigue flags this week. The fatigue rule did not fire on any active creative." }));
      return;
    }
    root.replaceChildren(...R.alerts.map(a =>
      h("div", { class: "alert" },
        h("div", { class: "alert-dim", text: "Creative" }),
        h("div", { class: "alert-msg", text: a.message }))));
  }

  function renderNotes() {
    const dq = R.data_quality.map(q => q.title + ". " + q.text);
    const pe = R.parse_errors.map(e => `${e.ad_name}: ${e.problem}`);
    document.getElementById("notes").replaceChildren(
      h("ul", { class: "notes" }, [...dq, ...pe, R.scope].map(t => h("li", { text: t }))));
  }

  renderHeader();
  renderKpis();
  renderFormulas();
  renderPlatforms();
  renderConcepts();
  renderCharts();
  renderScorecard();
  renderChanges();
  renderInsights();
  renderRecs();
  renderAlerts();
  renderNotes();
})();
