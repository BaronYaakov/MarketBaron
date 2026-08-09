const SERIES_SLOTS = 8; // --series-1 … --series-8, fixed categorical order
const MAX_HOLDING_ROWS = SERIES_SLOTS;

// Gain tile: account-level returns only (IBKR's own figures — never a
// per-ticker approximation), switchable by period via the 1D/1M/1Y/All tabs.
const GAIN_PERIOD_FIELDS = {
  day: "portfolio_day_change_pct",
  month: "portfolio_month_change_pct",
  year: "portfolio_year_change_pct",
  all: "portfolio_all_time_change_pct",
};
let gainValues = {};
let activeGainPeriod = "day";

function updateGainDisplay() {
  const el = document.getElementById("stat-gain");
  const value = gainValues[activeGainPeriod];
  el.className = "stat-value";
  if (typeof value !== "number") {
    el.textContent = "—";
  } else {
    el.textContent = `${value >= 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(2)}%`;
    if (value !== 0) el.classList.add(value > 0 ? "status-good" : "status-critical");
  }
  document.querySelectorAll(".gain-tab").forEach((btn) => {
    const isActive = btn.dataset.period === activeGainPeriod;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
}

document.querySelectorAll(".gain-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeGainPeriod = btn.dataset.period;
    updateGainDisplay();
  });
});

async function loadData() {
  let data;
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    showEmptyState();
    return;
  }
  render(data);
}

function showEmptyState() {
  document.getElementById("empty-state").hidden = false;
}

function render(data) {
  const allocation = Array.isArray(data.allocation) ? data.allocation : [];
  const news = Array.isArray(data.news) ? data.news : [];

  if (data.updated_at) {
    const d = new Date(data.updated_at);
    document.getElementById("updated").textContent = `Last updated ${d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  }

  // Trade Journal is the X timeline embed now (see index.html), independent
  // of data.json — it renders even in the empty-state case below.
  if (allocation.length === 0 && news.length === 0) {
    showEmptyState();
    return;
  }

  renderStats(data, allocation);
  renderHoldings(allocation, data.cash_percent);
  renderNews(news);
}

function renderStats(data, allocation) {
  const positionsEl = document.getElementById("stat-positions");
  const moverEl = document.getElementById("stat-mover");
  const moverSubEl = document.getElementById("stat-mover-sub");

  positionsEl.textContent = String(allocation.length);

  gainValues = {};
  for (const [period, field] of Object.entries(GAIN_PERIOD_FIELDS)) {
    if (typeof data[field] === "number") gainValues[period] = data[field];
  }
  updateGainDisplay();

  const withChange = allocation.filter((a) => typeof a.day_change_pct === "number");
  if (withChange.length === 0) {
    moverEl.textContent = "—";
    moverSubEl.textContent = "";
  } else {
    const top = withChange.reduce((a, b) => (Math.abs(b.day_change_pct) > Math.abs(a.day_change_pct) ? b : a));
    moverEl.textContent = top.ticker;
    moverSubEl.textContent = `${top.day_change_pct >= 0 ? "+" : ""}${top.day_change_pct.toFixed(2)}% today`;
    moverSubEl.className = "stat-sub";
    if (top.day_change_pct !== 0) moverSubEl.classList.add(top.day_change_pct > 0 ? "status-good" : "status-critical");
  }
}

function renderHoldings(allocation, cashPercent) {
  const body = document.getElementById("holdings-body");
  const count = document.getElementById("holdings-count");
  body.innerHTML = "";

  if (allocation.length === 0 && typeof cashPercent !== "number") {
    body.innerHTML = '<tr><td colspan="5" class="empty-row">No holdings yet.</td></tr>';
    count.textContent = "";
    return;
  }

  const sorted = [...allocation].sort((a, b) => b.percent - a.percent);

  // Fold anything past the categorical token ceiling into "Other" rather
  // than generate more hues (breaks CVD safety past the validated set).
  let rows = sorted;
  if (sorted.length > MAX_HOLDING_ROWS) {
    const kept = sorted.slice(0, MAX_HOLDING_ROWS - 1);
    const otherPct = sorted.slice(MAX_HOLDING_ROWS - 1).reduce((sum, a) => sum + a.percent, 0);
    rows = [...kept, { ticker: "Other", percent: otherPct, day_change_pct: null }];
  }

  if (typeof cashPercent === "number") {
    rows = [...rows, { ticker: "Cash", percent: cashPercent, isCash: true }];
  }

  count.textContent = `${allocation.length} position${allocation.length === 1 ? "" : "s"}`;

  let sawEstimate = false;
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");

    const tdTicker = document.createElement("td");
    tdTicker.className = "col-ticker";
    tdTicker.appendChild(buildTickerMark(r, i));
    tdTicker.append(" " + r.ticker);

    const tdPct = document.createElement("td");
    tdPct.className = "col-num";
    tdPct.textContent = `${r.percent.toFixed(1)}%`;

    const tdAvgPrice = document.createElement("td");
    tdAvgPrice.className = "col-num";
    tdAvgPrice.textContent = typeof r.avg_price === "number" ? `$${r.avg_price.toFixed(2)}` : "—";

    const tdChange = document.createElement("td");
    tdChange.className = "col-num";
    tdChange.appendChild(formatDayChange(r.day_change_pct, r.day_change_source));

    const tdAllTime = document.createElement("td");
    tdAllTime.className = "col-num";
    tdAllTime.appendChild(formatDayChange(r.all_time_gain_pct));

    tr.append(tdTicker, tdPct, tdAvgPrice, tdChange, tdAllTime);
    body.appendChild(tr);

    if (r.day_change_source === "finnhub_estimate") sawEstimate = true;
  });

  const note = document.getElementById("holdings-footnote");
  if (note) note.hidden = !sawEstimate;
}

function buildTickerMark(r, i) {
  // Fixed-size box so the ticker text always starts at the same x position,
  // whether it holds a 20px logo or falls back to the small colored dot.
  const dotColor = r.isCash ? "var(--ink-muted)" : `var(--series-${(i % SERIES_SLOTS) + 1})`;
  const wrap = document.createElement("span");
  wrap.className = "ticker-mark";

  const makeDot = () => {
    const dot = document.createElement("span");
    dot.className = "ticker-dot";
    dot.style.background = dotColor;
    return dot;
  };

  if (!r.logo_url) {
    wrap.appendChild(makeDot());
    return wrap;
  }

  const img = document.createElement("img");
  img.className = "ticker-logo";
  img.src = r.logo_url;
  img.alt = "";
  img.loading = "lazy";
  img.onerror = () => img.replaceWith(makeDot());
  wrap.appendChild(img);
  return wrap;
}

function formatDayChange(pct, source) {
  const wrap = document.createElement("span");
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    const span = document.createElement("span");
    span.className = "day-change status-flat";
    span.textContent = "—";
    return span;
  }
  const span = document.createElement("span");
  span.className = "day-change";
  if (pct > 0) {
    span.classList.add("status-good");
    span.textContent = `▲ ${pct.toFixed(2)}%`;
  } else if (pct < 0) {
    span.classList.add("status-critical");
    span.textContent = `▼ ${Math.abs(pct).toFixed(2)}%`;
  } else {
    span.classList.add("status-flat");
    span.textContent = "0.00%";
  }
  wrap.appendChild(span);
  if (source === "finnhub_estimate") {
    const flag = document.createElement("sup");
    flag.className = "estimate-flag";
    flag.title = "Estimated from the stock's price move (previous close → now), not yet account-verified";
    flag.textContent = "*";
    wrap.appendChild(flag);
  }
  return wrap;
}

function renderNews(news) {
  const list = document.getElementById("news-list");
  list.innerHTML = "";
  if (news.length === 0) {
    list.innerHTML = '<li class="empty-row">No recent news.</li>';
    return;
  }
  news.forEach((n) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = n.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = n.headline || "(untitled)";
    const meta = document.createElement("div");
    meta.className = "news-meta";
    const when = n.datetime ? new Date(n.datetime * 1000).toLocaleDateString() : "";
    const tag = document.createElement("span");
    tag.className = "ticker-tag";
    tag.textContent = n.ticker || "";
    meta.appendChild(tag);
    meta.append(` · ${[n.source, when].filter(Boolean).join(" · ")}`);
    li.append(a, meta);
    list.appendChild(li);
  });
}

loadData();
