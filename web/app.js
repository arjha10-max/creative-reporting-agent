(function () {
  "use strict";

  const R = window.REPORT_DATA;
  const DIMS = ["hook", "concept", "format", "audience"];
  const LABELS = { hook: "Hook", concept: "Concept", format: "Format", audience: "Audience" };

  const fmt = {
    pct: v => (v == null ? "–" : (v * 100).toFixed(2) + "%"),
    num: v => (v == null ? "–" : v.toFixed(2)),
    money: v => (v == null ? "–" : "$" + v.toLocaleString("en-CA", { maximumFractionDigits: 2 })),
    int: v => (v == null ? "–" : v.toLocaleString("en-CA")),
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

  function renderSummary() {
    const concepts = R.tag_tables.concept || [];
    const spend = concepts.reduce((s, e) => s + e.latest.spend, 0);
    const cards = [
      ["Latest week", R.latest_week],
      ["Ads in scope", R.ad_count],
      ["Spend, latest week", fmt.money(spend)],
      ["Open fatigue alerts", R.alerts.length],
    ];
    const root = document.getElementById("summary");
    root.replaceChildren(...cards.map(([label, value]) =>
      h("div", { class: "card" }, h("div", { class: "card-label", text: label }), h("div", { class: "card-value", text: String(value) }))
    ));
  }

  function renderAlerts() {
    const root = document.getElementById("alerts");
    if (!R.alerts.length) {
      root.replaceChildren(h("p", { class: "ok", text: "No fatigue flags this week." }));
      return;
    }
    root.replaceChildren(...R.alerts.map(a =>
      h("div", { class: "alert" },
        h("div", { class: "alert-dim", text: (a.dimension === "ad_name" ? "Ad" : LABELS[a.dimension] || a.dimension) }),
        h("div", { class: "alert-msg", text: a.message }),
        h("div", { class: "alert-nums" },
          h("span", { text: "Frequency " + fmt.num(a.frequency.prior) + " → " + fmt.num(a.frequency.latest) }),
          h("span", { text: "Click-to-trial " + fmt.pct(a.click_to_trial.prior) + " → " + fmt.pct(a.click_to_trial.latest) })
        )
      )
    ));
  }

  function renderTable(dim) {
    const rows = R.tag_tables[dim] || [];
    const flagged = new Set(R.alerts.filter(a => a.dimension === dim).map(a => a.value));
    const head = ["Tag", "Spend", "Hook rate", "CTR", "Click-to-trial", "Trial CPA", "Frequency", "Freq WoW", "C2T WoW"];
    const table = document.getElementById("table");
    table.replaceChildren(
      h("thead", {}, h("tr", {}, head.map(t => h("th", { text: t })))),
      h("tbody", {}, rows.map(r => {
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
          h("td", { class: deltaClass(w.click_to_trial, false), text: fmt.delta(w.click_to_trial) })
        );
      }))
    );
  }

  // Frequency going up is bad; click-to-trial going up is good.
  function deltaClass(v, higherIsBad) {
    if (v == null) return "";
    const bad = higherIsBad ? v > 0 : v < 0;
    return bad ? "bad" : "good";
  }

  function renderTabs(active) {
    const tabs = document.getElementById("tabs");
    tabs.replaceChildren(...DIMS.map(d => {
      const btn = h("button", {
        class: d === active ? "tab active" : "tab",
        role: "tab",
        "aria-selected": String(d === active),
        text: LABELS[d],
      });
      btn.addEventListener("click", () => { renderTabs(d); renderTable(d); });
      return btn;
    }));
  }

  function renderErrors() {
    const root = document.getElementById("errors");
    if (!R.parse_errors.length) {
      root.replaceChildren(h("p", { class: "ok", text: "All ad names follow the convention." }));
      return;
    }
    root.replaceChildren(h("ul", { class: "errors" }, R.parse_errors.map(e =>
      h("li", {}, h("code", { text: e.ad_name }), " line " + e.first_line + ": " + e.problem)
    )));
  }

  document.getElementById("scope").textContent = R.scope;
  renderSummary();
  renderAlerts();
  renderTabs("hook");
  renderTable("hook");
  renderErrors();
})();
