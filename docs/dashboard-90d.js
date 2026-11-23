(function () {
  "use strict";

  const R = window.REPORT_DATA;
  const NS = "http://www.w3.org/2000/svg";
  const W = R.window;

  const fmt = {
    pct: v => (v == null ? "–" : (v * 100).toFixed(2) + "%"),
    num: v => (v == null ? "–" : v.toFixed(2)),
    money: v => (v == null ? "–" : "$" + v.toLocaleString("en-CA", { maximumFractionDigits: 2 })),
    money0: v => (v == null ? "–" : "$" + Math.round(v).toLocaleString("en-CA")),
    int: v => (v == null ? "–" : Math.round(v).toLocaleString("en-CA")),
    delta: v => (v == null ? "–" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"),
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

  function renderHeader() {
    document.getElementById("window").textContent =
      `${W.weeks} weeks (${W.from} to ${W.to}) · latest week ${R.latest_week} · 90-day benchmark = all creatives combined`;
  }

  function renderKpis() {
    const b = W.benchmark;
    const cards = [
      ["Spend, 90 days", fmt.money0(b.spend)],
      ["Trial CPA, 90-day benchmark", fmt.money(b.trial_cpa)],
      ["Click-to-trial, 90 days", fmt.pct(b.click_to_trial)],
      ["Hook rate, 90 days", fmt.pct(b.hook_rate)],
      ["Creatives scored", R.scorecard.length],
      ["Fatigue alerts this week", R.alerts.length],
    ];
    document.getElementById("kpis").replaceChildren(...cards.map(([label, value]) =>
      h("div", { class: "card" }, h("div", { class: "card-label", text: label }), h("div", { class: "card-value", text: String(value) }))));
  }

  function renderScorecard() {
    const head = ["Creative", "Concept · Hook · Format · Audience", "Spend", "Trial CPA", "Index", "Hook rate", "Click-to-trial", "Frequency", "CPA trend, last 3 wks", "Verdict", "Why"];
    const pill = v => h("span", { class: "pill pill-" + v.toLowerCase().replace(/ /g, "-"), text: v });
    const rows = R.scorecard.map(s => h("tr", {},
      h("td", { class: "tag", text: s.value }),
      h("td", { class: "tags", text: [s.tags.concept, s.tags.hook, s.tags.format, s.tags.audience].join(" · ") }),
      h("td", { text: fmt.money0(s.spend) }),
      h("td", { text: fmt.money(s.trial_cpa) }),
      h("td", { class: s.index == null ? "" : s.index > 1 ? "bad" : "good", text: fmt.num(s.index) }),
      h("td", { text: fmt.pct(s.hook_rate) }),
      h("td", { text: fmt.pct(s.click_to_trial) }),
      h("td", { text: fmt.num(s.frequency) }),
      h("td", { class: badIfUp(s.cpa_trend_3w), text: fmt.delta(s.cpa_trend_3w) }),
      h("td", {}, pill(s.verdict)),
      h("td", { class: "why", text: s.reason })));
    document.getElementById("scorecard").replaceChildren(
      h("thead", {}, h("tr", {}, head.map(t => h("th", { text: t })))),
      h("tbody", {}, rows));
  }

  // Line chart; null points are skipped.
  function lineChart(title, points, fmtY) {
    const VW = 640, VH = 220, L = 70, RM = 16, T = 16, B = 34;
    const vals = points.map(p => p.y).filter(v => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const x = i => L + (points.length === 1 ? (VW - L - RM) / 2 : i * (VW - L - RM) / (points.length - 1));
    const y = v => T + (VH - T - B) * (1 - (v - lo) / span);
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
        points.map((p, i) => i % 2 === 0 || points.length < 8 ? svg("text", { class: "tick", x: x(i), y: VH - 10, "text-anchor": "middle" }, p.x.slice(5)) : null)));
  }

  // Horizontal bars; lowest value green, highest red when lowerIsBetter.
  function barChart(title, items, fmtV) {
    const VW = 420, rowH = 26, L = 150, RM = 70, T = 8;
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
            svg("rect", { class: cls(it.value), x: L, y: yy + 4, width: Math.max(w, 1), height: 15, rx: 3 }),
            svg("text", { class: "val", x: L + w + 6, y: yy + 16 }, fmtV(it.value)));
        })));
  }

  function renderTrend() {
    const tr = R.trend;
    document.getElementById("trend").replaceChildren(
      lineChart("Trial CPA by week", tr.map(t => ({ x: t.week, y: t.trial_cpa })), v => "$" + v.toFixed(1)),
      lineChart("Click-to-trial by week", tr.map(t => ({ x: t.week, y: t.click_to_trial })), v => (v * 100).toFixed(1) + "%"),
      lineChart("Frequency by week", tr.map(t => ({ x: t.week, y: t.frequency })), v => v.toFixed(2)),
      lineChart("Spend by week", tr.map(t => ({ x: t.week, y: t.spend })), v => "$" + Math.round(v).toLocaleString("en-CA")));
  }

  function renderTags() {
    const pick = dim => R.tags_90d[dim].filter(e => e.trial_cpa != null).map(e => ({ label: e.value, value: e.trial_cpa }));
    document.getElementById("tags").replaceChildren(
      barChart("Hook: trial CPA", pick("hook"), fmt.money),
      barChart("Format: trial CPA", pick("format"), fmt.money),
      barChart("Audience: trial CPA", pick("audience"), fmt.money));
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
      h("p", { class: "brief-line", text: fmt.money(c.trial_cpa) + " trial CPA · " + fmt.num(c.index) + "x benchmark · " + fmt.int(c.trials) + " trials, 90 days" }),
      h("p", { class: "brief-line hint", text: "Next creative: keep this hook, format and audience; vary the opening frame and the first line." }))));
  }

  function renderRecs() {
    const root = document.getElementById("recs");
    root.replaceChildren(...R.recommendations.map(r =>
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
        h("div", { class: "alert-msg", text: a.message })
      )));
  }

  function renderNotes() {
    const notes = [
      "Mock data, generated by agent/make_mock_data.py. Not connected to any ad platform.",
      "The verdicts and briefs are rule-based (thresholds in agent/creative_report.py), not a model.",
      "Trial and click-to-trial numbers are illustrative; check them against your own tracking before using them.",
    ];
    const bad = R.parse_errors.map(e => `${e.ad_name} (line ${e.first_line}) breaks the naming convention and is excluded from the scorecard.`);
    document.getElementById("notes").replaceChildren(
      h("ul", { class: "notes" }, [...notes, ...bad].map(t => h("li", { text: t }))));
  }

  renderHeader();
  renderKpis();
  renderScorecard();
  renderTrend();
  renderTags();
  renderBriefs();
  renderRecs();
  renderAlerts();
  renderNotes();
})();
