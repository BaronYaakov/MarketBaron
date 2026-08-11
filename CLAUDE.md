# MarketBaron — Project Brief for Claude Code

Public website showing only the % allocation of Jake's IBKR stock holdings, relevant news per holding, and recent X posts about trades. This file is the full handoff context — read it before making changes.

## What this project is

A public dashboard, auto-updated periodically, with **no visitor login and no live backend calls per visitor**. Visitors just load a static page that fetches a `data.json` file. That file gets refreshed on a schedule by processes described below — never by visitor traffic.

Live site (once Pages is enabled): `https://baronyaakov.github.io/MarketBaron/`
Repo: `https://github.com/BaronYaakov/MarketBaron` (public, empty except this scaffold)

## Critical constraint that shaped this design

This project is being built partly from **Claude Cowork** (a sandboxed environment with a *fixed, non-configurable* network allowlist on Jake's plan tier) and partly from **Claude Code** (running locally, normal network access). This was empirically validated, not assumed:

- Cowork's sandboxed bash/fetch tools **cannot reach** `finnhub.io`, `api.github.com`, or X's API domains — confirmed via a live test (403 `blocked-by-allowlist` from the sandbox's egress proxy).
- Cowork's bash/fetch tools **can** reach the official IBKR MCP connector, because that's a registered connector proxied through Cowork's own backend, not a raw outbound HTTP call subject to the sandbox proxy.
- Claude Code, running locally, has no such restriction — it uses Jake's real network.

**This means the architecture is split by necessity, not preference:**

| Task | Where it must run | Why |
|---|---|---|
| Read IBKR positions/allocation | Cowork (scheduled task) | Only Cowork has the IBKR MCP connector |
| Message Jake to approve a tweet | Cowork (scheduled task, in-chat) | Only Cowork can message Jake conversationally |
| Fetch Finnhub news | Local script (Claude Code) | Cowork sandbox blocks finnhub.io |
| Post to X | Local script (Claude Code) | Cowork sandbox blocks X's API |
| Push `data.json` to GitHub | Local script (Claude Code) | Cowork sandbox blocks api.github.com |

## Data flow

```
Cowork scheduled task (NOT YET BUILT — this is the one remaining piece, see below)
  → calls IBKR MCP connector → get_portfolio_allocation / get_orders
  → strips to the allow-listed fields ONLY (see Privacy rule below) — never
    quantity, balances, account value, or trade $ amounts
  → writes ibkr_snapshot.json to this repo folder in the schema below (local
    file write, no network needed)
  → checks for new trades vs last snapshot
  → if new trade: drafts tweet text, messages Jake in chat for approval
  → on approval: writes pending_tweet.json (text + trade info) to this repo folder
     (Cowork CANNOT post to X itself — sandbox blocks it — so it just queues the approved text)

Local script — update_dashboard.py (BUILT, running every 15 min via Windows
Task Scheduler, independent of whether Cowork is open)
  → reads ibkr_snapshot.json (written by the Cowork task above) — no-ops
    cleanly if it doesn't exist yet, which is the common case until Cowork's
    task is built
  → for each position missing an IBKR-sourced day_change_pct, estimates one
    from Finnhub's public quote (previous close vs. now) as a fallback —
    flagged on-site as an estimate, since it doesn't account for same-day
    fill timing the way IBKR's own figure would
  → fetches news per held ticker from Finnhub
  → checks pending_tweet.json — if present, posts it via the X API, records
    the result in posted_tweets.json, deletes the pending file (leaves it
    queued and retries next run on failure)
  → assembles data.json = { allocation: [...], cash_percent,
    portfolio_day_change_pct, portfolio_month_change_pct,
    portfolio_year_change_pct, portfolio_all_time_change_pct,
    news: [...], recent_posts: [...], transactions: [...], updated_at }
    (the four portfolio_* fields and transactions just pass through whatever
    ibkr_snapshot.json has — the local script does not compute or estimate
    them itself; recent_posts is still populated from posted_tweets.json but
    no longer rendered anywhere on-site, see the X-integration-paused note below)
  → git commit + push data.json (and posted_tweets.json) to BaronYaakov/MarketBaron
    (auth: GITHUB_TOKEN embedded in the push URL, GIT_TERMINAL_PROMPT=0 — never
    blocks waiting on a credential prompt, so it's safe fully unattended)
```

GitHub Pages (LIVE at `https://baronyaakov.github.io/MarketBaron/`, deploying from `main` / `/root`) serves `index.html`, which fetches `data.json` on load and renders: a stat row (a "Gain" tile with 1D/1M/1Y/All tabs — account-level only, IBKR's own figures; position count; top mover; a "Biggest Win" tile — see below), a positions table (symbol, allocation, avg price, day change, all-time gain), a transaction history (date, ticker, buy/sell, price — no share count, no dollar total), and market news by holding, filtered to currently-held tickers only. Purely static — visiting the page never triggers anything.

**Per-company pages (added 2026-08-09):** `stock.html` is a single template — not one file per ticker — that reads `?ticker=X` from the URL and renders from the same `data.json` (`stock.js`, same fetch-and-render pattern as `index.html`). Positions-table rows and Transaction History rows both link to it. It shows: company profile + live quote (name, industry, exchange, price, day range, 52-week range — all public company/market facts via Finnhub's `profile2`/`quote`/`metric` endpoints, not account data, so outside the privacy rule's scope; P/E and beta were fetched too but the tile was removed 2026-08-11, so `fetch_financials()` no longer requests them), "My Position" if currently held (or a "not currently held" note if fully closed out, with "Today's Gain" as the day-change label), news filtered to that ticker, and transactions filtered to that ticker. The backend fetches company/quote/news for the *union* of currently-held and ever-transacted tickers (`data.json`'s `companies` object, keyed by ticker) specifically so a fully-closed position (bought then sold, e.g. AMZN) still has a working page — check `update_dashboard.py`'s `main()` for `all_tickers`.

**"Biggest Win" tile (added 2026-08-11):** best-performing currently-held ticker, 1M/1Y/All tabs (`app.js`'s `winValues`/`.win-tab`, `update_dashboard.py`'s `compute_biggest_win()`, `data.json`'s `biggest_win.{month,year,all}`). Only positive gains count — a period shows "—" if nothing's up. `all` uses real `all_time_gain_pct` (already available, works today). `month`/`year` are **dormant by design**: they'd need `fetch_price_change()` (Finnhub's `/stock/candle` endpoint), which returns `403 Forbidden` on the current Finnhub plan — confirmed live. The wiring in `compute_biggest_win()` is commented out rather than silently burning doomed API calls every cycle; uncomment it if the plan is upgraded, or swap in a different historical-price source. The frontend already handles missing month/year gracefully (shows "—"), so re-enabling the backend is the only step needed.

**Transaction persistence:** `merge_transactions()` unions each run's transactions with whatever was already in the last-pushed `data.json`, deduped by `(date, ticker, action, price)`. This exists because Cowork's snapshot has been observed to omit the `transactions` field on some cycles (not every write includes it) — without the merge, a bare cycle would silently erase previously-known trade history from the live site. Once a trade is seen once, it stays on the site forever.

**X integration is paused (2026-08-09).** The Trade Journal panel briefly embedded a live X timeline widget (`@themarketbaron`) but it was pulled after `syndication.twitter.com` consistently returned `429 Rate limit exceeded` — confirmed directly in Jake's own browser DevTools, not just automated testing, so it's a real limitation of X's free embed API for a low-traffic/new account, not a bug or misconfiguration on our side. The panel now shows Transaction History instead. The X-posting mechanism itself (`post_pending_tweet()` in `update_dashboard.py`, the `pending_tweet.json`/`posted_tweets.json`/Cowork-approval pipeline) is untouched and still fully wired — only the *display* of tweets on the site was removed. Revisit the embed later if useful; the removed code is in git history (see commits around "Add fallback for X timeline embed" and the transaction-history swap).

### `ibkr_snapshot.json` expected schema (for whoever builds the Cowork task)

```json
{
  "allocation": [
    {
      "ticker": "AAPL",
      "percent": 42.5,
      "avg_price": 187.32,
      "day_change_pct": 0.31,
      "all_time_gain_pct": 22.8
    }
  ],
  "cash_percent": 8.4,
  "portfolio_day_change_pct": 0.62,
  "portfolio_month_change_pct": 3.1,
  "portfolio_year_change_pct": 14.3,
  "portfolio_all_time_change_pct": 41.7,
  "transactions": [
    {
      "date": "2026-08-08",
      "ticker": "AAPL",
      "action": "buy",
      "price": 187.32
    }
  ],
  "updated_at": "2026-08-09T06:30:00Z"
}
```

`transactions` (added 2026-08-09, replacing the paused X Trade Journal): a list of recent trades for the Transaction History panel, most-recent-first is not required (the frontend doesn't re-sort — order in equals order rendered). Each entry: `date` (any string `Date.parse()` can read, e.g. ISO), `ticker`, `action` (`"buy"` or `"sell"` only — anything else is dropped), `price` (optional, per-share — a price, not a total). No quantity, no dollar total, same rule as everywhere else. Malformed entries are dropped individually with a warning logged, not fatal to the whole run.

`portfolio_day_change_pct`/`portfolio_month_change_pct`/`portfolio_year_change_pct`/`portfolio_all_time_change_pct` are the whole-ACCOUNT return over that period (IBKR's own NAV/time-weighted return — e.g. its Portfolio Analyst performance data, if the connector exposes it), never any single position's move. This was a deliberate choice (2026-08-09, revised same day from an earlier day/week/year design to day/month/year/all-time): Jake wants these specifically as account growth, not a per-ticker estimate — so unlike `day_change_pct`, there is intentionally **no Finnhub fallback** for any of the four. The site renders them as a single "Gain" tile with a 1D/1M/1Y/All tab switcher (`index.html`'s `.gain-tabs`, wired in `app.js`'s `GAIN_PERIOD_FIELDS`) — if IBKR doesn't supply a given period, that tab just shows "—" when selected rather than approximating from individual holdings. **If the IBKR MCP connector doesn't currently expose 1-month/1-year/all-time account performance, that's worth checking** — whoever is iterating on the Cowork task should look for it (likely under a performance/NAV-history type tool) and add whichever periods are available to the snapshot.

A bare list (just `[{ticker, percent}, ...]`, no wrapping object) is also accepted for backward compatibility, but then none of the top-level fields above are available. `day_change_pct` (per-position) should be IBKR's own daily P&L % (correct for same-day fills) — if omitted, the local script estimates it from Finnhub and flags it on-site as an estimate; this fallback applies only to that one per-position field. Only the fields named in the Privacy rule below are read; anything else in an entry is silently dropped.

## Current state (as of 2026-08-09)

- IBKR MCP connector: **connected** in Cowork.
- GitHub repo `BaronYaakov/MarketBaron`: public, Pages **enabled and live**.
- `.env` at project root: populated with real `FINNHUB_API_KEY`, `X_API_BEARER_TOKEN`, `GITHUB_TOKEN` (`repo`-scope, verified working), `GITHUB_REPO=BaronYaakov/MarketBaron`. Gitignored, never committed.
- `backend/`, `frontend/`, and `validate_apis.ps1` from the earlier self-hosted-gateway plan: **removed** (git history still has them if ever needed).
- `update_dashboard.py`, the Windows Task Scheduler entry (`MarketBaron Dashboard Update`, every 15 min), and the static site (`index.html`/`style.css`/`app.js`, plus the per-company `stock.html`/`stock.js`) are **all built and live**.
- **Cowork scheduled task `marketbaron-ibkr-sync` is now BUILT and running** (every 15 min). Each run: refreshes `ibkr_snapshot.json` (percent, avg_price, day_change_pct, all_time_gain_pct per position, plus cash_percent and portfolio_day_change_pct), checks `get_account_trades` for anything new vs `last_seen_trade_ids.json`, and — if a new trade is found — appends a draft to `draft_tweets.json` with `status: "awaiting_approval"`. It never writes `pending_tweet.json` itself and never posts anything; that only happens when Jake approves a draft in a live chat with Claude (Cowork), which is what actually creates `pending_tweet.json` for the local script to pick up. First run after creation bootstraps `last_seen_trade_ids.json` from current trade history without drafting anything (avoids retroactively tweeting old trades). **Not yet supplying** `portfolio_month_change_pct` / `portfolio_year_change_pct` / `portfolio_all_time_change_pct` — only `portfolio_day_change_pct` so far; the site shows "—" for the other three Gain-tile tabs until those are added (see schema section above for what's expected and why there's no per-ticker fallback for them).

## What's left to build

1. **End-to-end test**: confirm a full cycle — Cowork writes a real snapshot → local script picks it up within 15 min → `data.json` updates with real numbers → site reflects it. Also test the approval path once a real new trade occurs: draft appears in `draft_tweets.json` → Jake approves in chat → `pending_tweet.json` gets created → local script posts it and clears the pending file.

## Privacy rule (non-negotiable, updated 2026-08-09)

Allowed to reach `data.json` / the public repo, per position: `ticker`, `percent` (allocation), `avg_price` (per-share cost basis), `day_change_pct`, `all_time_gain_pct`. Also allowed at the top level: `cash_percent` (cash as a % of total portfolio), `portfolio_day_change_pct`, `portfolio_month_change_pct`, `portfolio_year_change_pct`, `portfolio_all_time_change_pct` (account-level return over each period), and `transactions` (list of `{date, ticker, action: "buy"|"sell", price}` — price is per-share). These are all prices or percentages — never quantities or totals.

**Never allowed, at any layer:** share/contract quantity (position size), account value, total balance, total position dollar value ($ market value = price × quantity), or dollar P&L. The line is "per-share price or a percentage" (fine) vs. "anything requiring quantity to compute, or a dollar total" (forbidden) — quantity is the one number that must never leave the account boundary, since combined with price it reconstructs position size/value.

Enforce this at the point of writing `ibkr_snapshot.json` (Cowork side), not just in the frontend. `update_dashboard.py`'s `load_allocation()` only passes through the specific allowed keys by name — it does not forward unknown fields, so an accidental extra key from the Cowork task (e.g. `quantity`, `mkt_value`) is dropped, not leaked, but Cowork still shouldn't write it to the snapshot file at all.

Note: `data.json`'s `companies` object (added 2026-08-09 for the per-company pages) is **outside this rule's scope entirely** — it's public company/market data fetched directly from Finnhub (name, industry, exchange, price, market cap, 52-week range, P/E, beta), not derived from IBKR/Jake's account at all, so quantity/value concerns don't apply to it.
