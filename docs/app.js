(function () {
  "use strict";

  const R = window.REPORT_DATA;
  const VIEWS = [
    ["hook", "Hook"],
    ["concept", "Concept"],
    ["format", "Format"],
    ["audience", "Audience"],
    ["creative", "Creatives"],
    ["insights", "Insights"],
    ["charts", "Charts"],
    ["recommendations", "Recommendations"],
    ["data", "Data view"],
  ];
  const NS = "http://www.w3.org/2000/svg";

  const fmt = {
    pct: v => (v == null ? "–" : (v * 100).toFixed(2) + "%"),
    num: v => (v == null ? "–" : v.toFixed(2)),
    money: v => (v == null ? "–" : "$" + v.toLocaleString("en-CA", { maximumFractionDigits: 2 })),
    int: v => (v == null ? "–" : Math.round(v).toLocaleString("en-CA")),
    delta: v => (v == null ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"),
  };

  const ratio = (a, b) => (b ? a / b : null);

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

  // Frequency going up is bad; click-to-trial going up is good.
  function deltaClass(v, higherIsBad) {
    if (v == null) return "";
    const bad = higherIsBad ? v > 0 : v < 0;
    return bad ? "bad" : "good";
  }

  const panel = () => document.getElementById("panel");

  function renderSummary() {
    const spend = (R.tag_tables.concept || []).reduce((s, e) => s + e.latest.spend, 0);
    const cards = [
      ["Latest week", R.latest_week],
      ["Creatives in scope", R.ad_count],
      ["Spend, latest week", fmt.money(spend)],
      ["Open fatigue alerts", R.alerts.length],
    ];
    document.getElementById("summary").replaceChildren(...cards.map(([label, value]) =>
      h("div", { class: "card" }, h("div", { class: "card-label", text: label }), h("div", { class: "card-value", text: String(value) }))
    ));
  }

  function renderAlerts() {
    const root = document.getElementById("alerts");
    if (!R.alerts.length) {
      root.replaceChildren(h("p", { class: "ok", text: "No fatigue flags this week." }));
      return;
    }
    const labels = { hook: "Hook", concept: "Concept", format: "Format", audience: "Audience", ad_name: "Creative" };
    root.replaceChildren(...R.alerts.map(a =>
      h("div", { class: "alert" },
        h("div", { class: "alert-dim", text: labels[a.dimension] || a.dimension }),
        h("div", { class: "alert-msg", text: a.message }),
        h("div", { class: "alert-nums" },
          h("span", { text: "Frequency " + fmt.num(a.frequency.prior) + " → " + fmt.num(a.frequency.latest) }),
          h("span", { text: "Click-to-trial " + fmt.pct(a.click_to_trial.prior) + " → " + fmt.pct(a.click_to_trial.latest) })
        )
      )
    ));
  }

  function table(head, body) {
    return h("div", { class: "table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {}, head.map(t => h("th", { text: t })))),
        h("tbody", {}, body)));
  }

  function renderTagTable(dim) {
    const flagged = new Set(R.alerts.filter(a => a.dimension === dim).map(a => a.value));
    const head = ["Tag", "Spend", "Hook rate", "CTR", "Click-to-trial", "Trial CPA", "Frequency", "Freq WoW", "C2T WoW"];
    const body = (R.tag_tables[dim] || []).map(r => {
      const l = r.latest, w = r.wow;
      return h("tr", { class: flagged.has(r.value) ? "flag" : "" },
        h("td", { class: "tag", text: r.value }),
        h("td", { text: fmt.money(l.spend) }),
        h("td", { text: fmt.pct(l.hook_rate) }),
        h("td", { text: fmt.pct(l.ctr) }),
        h("td", { text: fmt.pct(l.click_to_trial) }),
        h("td", { text: fmt.money(l.trial_cpa) }),
        h("td", { text: fmt.num(l.frequency) }),
        h("td", { class: deltaClass(w.frequency, true), text: fmt.delta(w.frequency) }),
        h("td", { class: deltaClass(w.click_to_trial, false), text: fmt.delta(w.click_to_trial) }));
    });
    panel().replaceChildren(table(head, body));
  }

  // One row per creative version, with its parsed tags and latest-week KPIs.
  function renderCreatives() {
    const flagged = new Set(R.alerts.filter(a => a.dimension === "ad_name").map(a => a.value));
    const head = ["Creative", "Concept", "Hook", "Format", "Audience", "Version", "Spend", "Hook rate", "CTR", "Click-to-trial", "Trial CPA", "Frequency", "Freq WoW", "C2T WoW"];
    const body = R.ads.map(a => {
      const l = a.latest, w = a.wow, t = a.tags;
      return h("tr", { class: flagged.has(a.value) ? "flag" : "" },
        h("td", { class: "tag", text: a.value }),
        h("td", { text: t.concept }),
        h("td", { text: t.hook }),
        h("td", { text: t.format }),
        h("td", { text: t.audience }),
        h("td", { text: t.variant }),
        h("td", { text: fmt.money(l.spend) }),
        h("td", { text: fmt.pct(l.hook_rate) }),
        h("td", { text: fmt.pct(l.ctr) }),
        h("td", { text: fmt.pct(l.click_to_trial) }),
        h("td", { text: fmt.money(l.trial_cpa) }),
        h("td", { text: fmt.num(l.frequency) }),
        h("td", { class: deltaClass(w.frequency, true), text: fmt.delta(w.frequency) }),
        h("td", { class: deltaClass(w.click_to_trial, false), text: fmt.delta(w.click_to_trial) }));
    });
    panel().replaceChildren(table(head, body));
  }

  // Every weekly row the agent read, with KPIs derived per row. Filter by creative.
  function renderData(filter) {
    const sel = h("select", { class: "select", "aria-label": "Filter by creative" },
      h("option", { value: "", text: "All creatives" }),
      R.ads.map(a => h("option", { value: a.value, text: a.value })));
    sel.value = filter || "";
    sel.addEventListener("change", () => renderData(sel.value));

    const rows = R.raw_rows.filter(r => !filter || r.ad_name === filter);
    const head = ["Week", "Creative", "Spend", "Impressions", "Reach", "Frequency", "3-sec views", "Hook rate", "Clicks", "CTR", "Trials", "Click-to-trial", "Trial CPA"];
    const body = rows.map(r => h("tr", {},
      h("td", { class: "tag", text: r.week }),
      h("td", { class: "tag", text: r.ad_name }),
      h("td", { text: fmt.money(r.spend) }),
      h("td", { text: fmt.int(r.impressions) }),
      h("td", { text: fmt.int(r.reach) }),
      h("td", { text: fmt.num(ratio(r.impressions, r.reach)) }),
      h("td", { text: fmt.int(r.three_sec_views) }),
      h("td", { text: fmt.pct(ratio(r.three_sec_views, r.impressions)) }),
      h("td", { text: fmt.int(r.clicks) }),
      h("td", { text: fmt.pct(ratio(r.clicks, r.impressions)) }),
      h("td", { text: fmt.int(r.trials) }),
      h("td", { text: fmt.pct(ratio(r.trials, r.clicks)) }),
      h("td", { text: fmt.money(ratio(r.spend, r.trials)) })));

    panel().replaceChildren(
      h("p", { class: "hint", text: rows.length + " rows · weeks " + R.weeks.join(", ") + " · totals are for the selected creative(s)" }),
      h("div", { class: "toolbar" }, h("label", { text: "Creative " }), sel),
      table(head, body));
  }

  function renderInsights() {
    panel().replaceChildren(...R.insights.map(i =>
      h("div", { class: "insight" },
        h("div", { class: "insight-title", text: i.title }),
        h("p", { class: "insight-text", text: i.text }))));
  }

  // Line chart with one point per x label. Null values are skipped.
  function lineChart(title, points, fmtY) {
    const W = 640, H = 240, L = 64, RM = 16, T = 16, B = 36;
    const vals = points.map(p => p.y).filter(v => v != null);
    if (!vals.length) return h("div", { class: "chart-card" }, h("h3", { text: title }), h("p", { class: "hint", text: "No data." }));
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const x = i => L + (points.length === 1 ? (W - L - RM) / 2 : i * (W - L - RM) / (points.length - 1));
    const y = v => T + (H - T - B) * (1 - (v - lo) / span);
    const path = points.map((p, i) => p.y == null ? null : [x(i), y(p.y)]).filter(Boolean);
    const d = path.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const ticks = [lo, lo + span / 2, hi];
    return h("div", { class: "chart-card" },
      h("h3", { text: title }),
      svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title },
        ticks.map(t => svg("g", {},
          svg("line", { class: "axis", x1: L, x2: W - RM, y1: y(t), y2: y(t) }),
          svg("text", { class: "tick", x: L - 8, y: y(t) + 4, "text-anchor": "end" }, fmtY(t)))),
        svg("path", { class: "line", d }),
        path.map(p => svg("circle", { class: "dot", cx: p[0], cy: p[1], r: 3.5 })),
        points.map((p, i) => svg("text", { class: "tick", x: x(i), y: H - 12, "text-anchor": "middle" }, p.x))));
  }

  // Horizontal bar chart, one bar per item. Best and worst are coloured when lowerIsBetter is set.
  function barChart(title, items, fmtV, lowerIsBetter) {
    const W = 640, rowH = 28, L = 190, RM = 80, T = 10;
    const H = T + items.length * rowH + 10;
    if (!items.length) return h("div", { class: "chart-card" }, h("h3", { text: title }), h("p", { class: "hint", text: "No data." }));
    const max = Math.max(...items.map(i => i.value)) || 1;
    const vals = items.map(i => i.value);
    const best = lowerIsBetter ? Math.min(...vals) : null;
    const worst = lowerIsBetter ? Math.max(...vals) : null;
    const cls = v => (!lowerIsBetter ? "bar" : v === best ? "bar-best" : v === worst ? "bar-worst" : "bar");
    return h("div", { class: "chart-card" },
      h("h3", { text: title }),
      svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title },
        items.map((it, i) => {
          const yy = T + i * rowH;
          const w = (W - L - RM) * (it.value / max);
          return svg("g", {},
            svg("text", { class: "lbl", x: L - 10, y: yy + 17, "text-anchor": "end" }, it.label),
            svg("rect", { class: cls(it.value), x: L, y: yy + 4, width: Math.max(w, 1), height: 16, rx: 3 }),
            svg("text", { class: "val", x: L + w + 6, y: yy + 17 }, fmtV(it.value)));
        })));
  }

  function renderCharts() {
    const trend = R.trend;
    const hookItems = (R.tag_tables.hook || []).filter(e => e.latest.trial_cpa != null)
      .map(e => ({ label: e.value, value: e.latest.trial_cpa }));
    panel().replaceChildren(h("div", { class: "chart-grid" },
      lineChart("Frequency by week (all creatives)", trend.map(t => ({ x: t.week, y: t.frequency })), v => v.toFixed(2)),
      lineChart("Click-to-trial by week (all creatives)", trend.map(t => ({ x: t.week, y: t.click_to_trial })), v => (v * 100).toFixed(1) + "%"),
      lineChart("Blended trial CPA by week", trend.map(t => ({ x: t.week, y: t.trial_cpa })), v => "$" + v.toFixed(0)),
      lineChart("Spend by week", trend.map(t => ({ x: t.week, y: t.spend })), v => "$" + Math.round(v).toLocaleString("en-CA")),
      barChart("Trial CPA by creative, latest week (green = lowest, red = highest)",
        R.ads.filter(a => a.latest.trial_cpa != null).map(a => ({ label: a.value, value: a.latest.trial_cpa })), fmt.money, true),
      barChart("Hook rate by creative, latest week",
        R.ads.filter(a => a.latest.hook_rate != null).map(a => ({ label: a.value, value: a.latest.hook_rate })), fmt.pct, false),
      barChart("Trial CPA by hook family, latest week", hookItems, fmt.money, true)));
  }

  function renderRecommendations() {
    panel().replaceChildren(...R.recommendations.map(r =>
      h("div", { class: "rec rec-" + r.priority },
        h("div", { class: "rec-prio", text: r.priority + " priority" }),
        h("div", { class: "rec-title", text: r.title }),
        h("p", { class: "rec-action", text: r.action }),
        h("p", { class: "rec-why", text: "Why: " + r.why }))));
  }

  function renderErrors() {
    const root = document.getElementById("errors");
    if (!R.parse_errors.length) {
      root.replaceChildren(h("p", { class: "ok", text: "All ad names follow the convention." }));
      return;
    }
    root.replaceChildren(h("ul", { class: "errors" }, R.parse_errors.map(e =>
      h("li", {}, h("code", { text: e.ad_name }), " line " + e.first_line + ": " + e.problem))));
  }

  function show(view) {
    renderTabs(view);
    if (TAGS.includes(view)) return renderTagTable(view);
    if (view === "creative") return renderCreatives();
    if (view === "insights") return renderInsights();
    if (view === "charts") return renderCharts();
    if (view === "recommendations") return renderRecommendations();
    if (view === "data") return renderData("");
  }

  const TAGS = ["hook", "concept", "format", "audience"];

  function renderTabs(active) {
    const tabs = document.getElementById("tabs");
    tabs.replaceChildren(...VIEWS.map(([key, label]) => {
      const btn = h("button", {
        class: key === active ? "tab active" : "tab",
        role: "tab",
        "aria-selected": String(key === active),
        text: label,
      });
      btn.addEventListener("click", () => show(key));
      return btn;
    }));
  }

  document.getElementById("scope").textContent = R.scope;
  renderSummary();
  renderAlerts();
  renderErrors();
  show("hook");
})();
