const ALLOCATION_COLORS = [
  "#4f8cff", "#ff8c4f", "#4fdb8c", "#db4fdb", "#dbdb4f",
  "#4fdbdb", "#ff4f7a", "#8c4fff", "#c9c9c9", "#ffb84f",
];

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
    document.getElementById("updated").textContent = `Last updated: ${d.toLocaleString()}`;
  }

  if (allocation.length === 0 && news.length === 0 && posts.length === 0) {
    showEmptyState();
    return;
  }

  renderAllocation(allocation);
  renderNews(news);
  renderPosts(posts);
}

function renderAllocation(allocation) {
  const list = document.getElementById("allocation-list");
  list.innerHTML = "";
  allocation.forEach((a) => {
    const li = document.createElement("li");
    const ticker = document.createElement("span");
    ticker.className = "ticker";
    ticker.textContent = a.ticker;
    const pct = document.createElement("span");
    pct.textContent = `${a.percent.toFixed(1)}%`;
    li.append(ticker, pct);
    list.appendChild(li);
  });

  if (allocation.length === 0) return;

  new Chart(document.getElementById("allocation-chart"), {
    type: "doughnut",
    data: {
      labels: allocation.map((a) => a.ticker),
      datasets: [{
        data: allocation.map((a) => a.percent),
        backgroundColor: allocation.map((_, i) => ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed.toFixed(1)}%`,
          },
        },
      },
    },
  });
}

function renderNews(news) {
  const list = document.getElementById("news-list");
  list.innerHTML = "";
  if (news.length === 0) {
    list.innerHTML = "<li>No recent news.</li>";
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
    meta.textContent = [n.ticker, n.source, when].filter(Boolean).join(" · ");
    li.append(a, meta);
    list.appendChild(li);
  });
}

function renderPosts(posts) {
  const list = document.getElementById("posts-list");
  list.innerHTML = "";
  if (posts.length === 0) {
    list.innerHTML = "<li>No recent posts.</li>";
    return;
  }
  posts.forEach((p) => {
    const li = document.createElement("li");
    const text = document.createElement("div");
    text.className = "post-text";
    text.textContent = p.text || "";
    const meta = document.createElement("div");
    meta.className = "post-meta";
    const when = p.posted_at ? new Date(p.posted_at).toLocaleString() : "";
    meta.textContent = when;
    li.append(text, meta);
    list.appendChild(li);
  });
}

loadData();
