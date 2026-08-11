// Finnhub's raw exchange field is verbose ("NASDAQ NMS - GLOBAL MARKET",
// "NEW YORK STOCK EXCHANGE, INC."). Trim to the common short form.
function shortExchangeName(exchange) {
  if (!exchange) return exchange;
  let name = exchange.split(" - ")[0].replace(/,?\s*INC\.?$/i, "").trim();
  const KNOWN = { "NEW YORK STOCK EXCHANGE": "NYSE", "NASDAQ NMS": "NASDAQ" };
  return KNOWN[name.toUpperCase()] || name;
}

function formatChange(pct) {
  const span = document.createElement("span");
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    span.className = "day-change status-flat";
    span.textContent = "—";
    return span;
  }
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
  return span;
}

function buildLogo(logoUrl, size) {
  const wrap = document.createElement("span");
  wrap.className = "company-logo";
  wrap.style.width = wrap.style.height = `${size}px`;
  if (!logoUrl) return wrap;
  const img = document.createElement("img");
  img.src = logoUrl;
  img.alt = "";
  img.onerror = () => { img.style.display = "none"; };
  wrap.appendChild(img);
  return wrap;
}

async function loadStockPage() {
  const params = new URLSearchParams(window.location.search);
  const ticker = (params.get("ticker") || "").toUpperCase();

  let data;
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    document.getElementById("not-found").hidden = false;
    return;
  }

  const allocation = Array.isArray(data.allocation) ? data.allocation : [];
  const position = allocation.find((a) => a.ticker === ticker);
  const company = (data.companies && data.companies[ticker]) || null;
  const news = (Array.isArray(data.news) ? data.news : []).filter((n) => n.ticker === ticker);
  const transactions = (Array.isArray(data.transactions) ? data.transactions : []).filter((t) => t.ticker === ticker);

  // A page is valid if it's a current position, OR there's a company
  // profile/news for it, OR there's trade history — that last case is what
  // keeps a fully-closed position's page reachable after it drops out of
  // current holdings.
  const hasAnyRecord = position || company || news.length > 0 || transactions.length > 0;
  if (!ticker || !hasAnyRecord) {
    document.getElementById("not-found").hidden = false;
    return;
  }
  const companyData = company || {};

  document.title = `${companyData.name || ticker} (${ticker}) — MarketBaron`;
  document.getElementById("stock-content").hidden = false;

  if (data.updated_at) {
    const d = new Date(data.updated_at);
    document.getElementById("updated").textContent = `Last updated ${d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  }

  document.getElementById("company-logo-wrap").appendChild(buildLogo(companyData.logo_url, 48));
  document.getElementById("company-name").textContent = companyData.name || ticker;
  document.getElementById("company-sub").textContent = [
    ticker,
    shortExchangeName(companyData.exchange),
    companyData.industry,
  ].filter(Boolean).join(" · ");

  const priceEl = document.getElementById("quote-price");
  priceEl.textContent = typeof companyData.price === "number" ? `$${companyData.price.toFixed(2)}` : "—";
  const changeEl = document.getElementById("quote-change");
  changeEl.innerHTML = "";
  if (typeof companyData.day_change_pct === "number") changeEl.appendChild(formatChange(companyData.day_change_pct));

  document.getElementById("quote-range").textContent =
    typeof companyData.day_low === "number" && typeof companyData.day_high === "number"
      ? `$${companyData.day_low.toFixed(2)} – $${companyData.day_high.toFixed(2)}`
      : "—";

  document.getElementById("quote-52w").textContent =
    typeof companyData.week52_low === "number" && typeof companyData.week52_high === "number"
      ? `$${companyData.week52_low.toFixed(2)} – $${companyData.week52_high.toFixed(2)}`
      : "—";

  const pe = typeof companyData.pe_ratio === "number" ? companyData.pe_ratio.toFixed(1) : "—";
  const beta = typeof companyData.beta === "number" ? companyData.beta.toFixed(2) : "—";
  document.getElementById("quote-pe").textContent = `${pe} · ${beta}`;

  const positionStats = document.getElementById("position-stats");
  const positionNote = document.getElementById("position-note");
  const closedNote = document.getElementById("closed-position-note");
  if (position) {
    positionStats.hidden = false;
    positionNote.hidden = true;
    closedNote.hidden = true;
    document.getElementById("pos-allocation").textContent = `${position.percent.toFixed(1)}%`;
    document.getElementById("pos-avg-price").textContent =
      typeof position.avg_price === "number" ? `$${position.avg_price.toFixed(2)}` : "—";
    document.getElementById("pos-day-change").innerHTML = "";
    document.getElementById("pos-day-change").appendChild(formatChange(position.day_change_pct));
    document.getElementById("pos-all-time").innerHTML = "";
    document.getElementById("pos-all-time").appendChild(formatChange(position.all_time_gain_pct));
  } else {
    positionStats.hidden = true;
    positionNote.hidden = false;
    closedNote.hidden = false;
  }

  const newsList = document.getElementById("company-news-list");
  newsList.innerHTML = "";
  if (news.length === 0) {
    newsList.innerHTML = '<li class="empty-row">No recent news.</li>';
  } else {
    news.forEach((n) => {
      const li = document.createElement("li");
      li.className = "news-row";
      const icon = document.createElement("span");
      icon.className = "news-icon";
      icon.appendChild(buildLogo(companyData.logo_url, 28));
      const body = document.createElement("div");
      body.className = "news-body";
      const a = document.createElement("a");
      a.href = n.url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = n.headline || "(untitled)";
      const meta = document.createElement("div");
      meta.className = "news-meta";
      const when = n.datetime ? new Date(n.datetime * 1000).toLocaleDateString() : "";
      meta.textContent = [n.source, when].filter(Boolean).join(" · ");
      body.append(a, meta);
      li.append(icon, body);
      newsList.appendChild(li);
    });
  }

  const txBody = document.getElementById("company-transactions-body");
  txBody.innerHTML = "";
  if (transactions.length === 0) {
    txBody.innerHTML = '<tr><td colspan="3" class="empty-row">No transactions yet.</td></tr>';
  } else {
    transactions.forEach((t) => {
      const row = document.createElement("tr");
      const tdAction = document.createElement("td");
      tdAction.className = "col-action";
      const badge = document.createElement("span");
      badge.className = `transaction-action action-${(t.action || "").toLowerCase()}`;
      badge.textContent = (t.action || "").toUpperCase();
      tdAction.appendChild(badge);
      const tdDate = document.createElement("td");
      tdDate.className = "col-num";
      tdDate.textContent = t.date ? new Date(t.date).toLocaleDateString(undefined, { dateStyle: "medium" }) : "";
      const tdPrice = document.createElement("td");
      tdPrice.className = "col-num";
      tdPrice.textContent = typeof t.price === "number" ? `$${t.price.toFixed(2)}` : "—";
      row.append(tdAction, tdDate, tdPrice);
      txBody.appendChild(row);
    });
  }
}

loadStockPage();
