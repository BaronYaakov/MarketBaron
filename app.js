const SERIES_SLOTS = 8; // --series-1 … --series-8, fixed categorical order
const MAX_HOLDING_ROWS = SERIES_SLOTS;

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
  const posts = Array.isArray(data.recent_posts) ? data.recent_posts : [];

  if (data.updated_at) {
    const d = new Date(data.updated_at);
    document.getElementById("updated").textContent = `Last updated ${d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  }

  if (allocation.length === 0 && news.length === 0 && posts.length === 0) {
    showEmptyState();
    return;
  }

  renderStats(allocation);
  renderHoldings(allocation);
  renderNews(news);
  renderPosts(posts);
}

function renderStats(allocation) {
  const todayEl = document.getElementById("stat-today");
  const positionsEl = document.getElementById("stat-positions");
  const moverEl = document.getElementById("stat-mover");
  const moverSubEl = document.getElementById("stat-mover-sub");

  const withChange = allocation.filter((a) => typeof a.day_change_pct === "number");

  positionsEl.textContent = String(allocation.length);

  todayEl.className = "stat-value";
  if (withChange.length === 0) {
    todayEl.textContent = "—";
  } else {
    const totalPct = withChange.reduce((sum, a) => sum + a.percent, 0) || 1;
    const weighted = withChange.reduce((sum, a) => sum + a.percent * a.day_change_pct, 0) / totalPct;
    todayEl.textContent = `${weighted >= 0 ? "▲" : "▼"} ${Math.abs(weighted).toFixed(2)}%`;
    if (weighted !== 0) todayEl.classList.add(weighted > 0 ? "status-good" : "status-critical");
  }

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

function renderHoldings(allocation) {
  const body = document.getElementById("holdings-body");
  const count = document.getElementById("holdings-count");
  body.innerHTML = "";

  if (allocation.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty-row">No holdings yet.</td></tr>';
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

  count.textContent = `${allocation.length} position${allocation.length === 1 ? "" : "s"}`;

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");

    const tdTicker = document.createElement("td");
    tdTicker.className = "col-ticker";
    const dot = document.createElement("span");
    dot.className = "ticker-dot";
    dot.style.background = `var(--series-${(i % SERIES_SLOTS) + 1})`;
    tdTicker.append(dot, r.ticker);

    const tdPct = document.createElement("td");
    tdPct.className = "col-num";
    tdPct.textContent = `${r.percent.toFixed(1)}%`;

    const tdChange = document.createElement("td");
    tdChange.className = "col-num";
    tdChange.appendChild(formatDayChange(r.day_change_pct));

    tr.append(tdTicker, tdPct, tdChange);
    body.appendChild(tr);
  });
}

function formatDayChange(pct) {
  const span = document.createElement("span");
  span.className = "day-change";
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    span.classList.add("status-flat");
    span.textContent = "—";
    return span;
  }
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
  return span;
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

function renderPosts(posts) {
  const list = document.getElementById("posts-list");
  list.innerHTML = "";
  if (posts.length === 0) {
    list.innerHTML = '<li class="empty-row">No recent posts.</li>';
    return;
  }
  posts.forEach((p) => {
    const li = document.createElement("li");
    const text = document.createElement("div");
    text.className = "post-text";
    text.textContent = p.text || "";
    const meta = document.createElement("div");
    meta.className = "post-meta";
    const when = p.posted_at ? new Date(p.posted_at).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }) : "";
    meta.textContent = when;
    li.append(text, meta);
    list.appendChild(li);
  });
}

loadData();
