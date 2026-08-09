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

  renderHoldings(allocation);
  renderNews(news);
  renderPosts(posts);
}

function renderHoldings(allocation) {
  const list = document.getElementById("holdings-list");
  const count = document.getElementById("holdings-count");
  list.innerHTML = "";

  if (allocation.length === 0) {
    list.innerHTML = '<p class="empty-row">No holdings yet.</p>';
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
    rows = [...kept, { ticker: "Other", percent: otherPct }];
  }

  count.textContent = `${allocation.length} position${allocation.length === 1 ? "" : "s"}`;

  const maxPct = Math.max(...rows.map((r) => r.percent), 1);

  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "holding-row";

    const ticker = document.createElement("span");
    ticker.className = "holding-ticker";
    ticker.textContent = r.ticker;

    const track = document.createElement("div");
    track.className = "holding-track";
    const fill = document.createElement("div");
    fill.className = "holding-fill";
    fill.style.width = `${Math.max((r.percent / maxPct) * 100, 1.5)}%`;
    fill.style.background = `var(--series-${(i % SERIES_SLOTS) + 1})`;
    track.appendChild(fill);

    const pct = document.createElement("span");
    pct.className = "holding-pct";
    pct.textContent = `${r.percent.toFixed(1)}%`;

    row.append(ticker, track, pct);
    list.appendChild(row);
  });
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
