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
  → assembles data.json = { allocation: [...], cash_percent, news: [...],
    recent_posts: [...], updated_at }
  → git commit + push data.json (and posted_tweets.json) to BaronYaakov/MarketBaron
    (auth: GITHUB_TOKEN embedded in the push URL, GIT_TERMINAL_PROMPT=0 — never
    blocks waiting on a credential prompt, so it's safe fully unattended)
```

GitHub Pages (LIVE at `https://baronyaakov.github.io/MarketBaron/`, deploying from `main` / `/root`) serves `index.html`, which fetches `data.json` on load and renders: a stat row (today's weighted % move, position count, cash %, top mover), a positions table (symbol, allocation, avg price, day change, all-time gain), a trade journal (rationale behind recent trades), and market news by holding. Purely static — visiting the page never triggers anything.

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
  "cash_percent": 8.4
}
```

A bare list (just `[{ticker, percent}, ...]`, no wrapping object) is also accepted for backward compatibility, but then `cash_percent` and the optional per-position fields aren't available. `day_change_pct` should be IBKR's own per-position daily P&L % (correct for same-day fills) — if omitted, the local script estimates it from Finnhub and flags it on-site as an estimate. Only the fields named in the Privacy rule below are read; anything else in an entry is silently dropped.

## Current state (as of 2026-08-09)

- IBKR MCP connector: **connected** in Cowork.
- GitHub repo `BaronYaakov/MarketBaron`: public, Pages **enabled and live**.
- `.env` at project root: populated with real `FINNHUB_API_KEY`, `X_API_BEARER_TOKEN`, `GITHUB_TOKEN` (`repo`-scope, verified working), `GITHUB_REPO=BaronYaakov/MarketBaron`. Gitignored, never committed.
- `backend/`, `frontend/`, and `validate_apis.ps1` from the earlier self-hosted-gateway plan: **removed** (git history still has them if ever needed).
- `update_dashboard.py`, the Windows Task Scheduler entry (`MarketBaron Dashboard Update`, every 15 min), and the static site (`index.html`/`style.css`/`app.js`) are **all built and live**.
- **The one remaining piece: no Cowork scheduled task exists yet** for the real IBKR-polling pipeline (only a one-time validation task ran, which auto-disabled). Until it exists, `ibkr_snapshot.json` is absent and the local script no-ops every run. The site is currently showing placeholder test data from manual validation runs, not real positions.

## What's left to build

1. **Cowork scheduled task**: recurring, calls the IBKR connector, does the strip-to-allowed-fields + trade-diff + approval-message logic described above, writes `ibkr_snapshot.json` (schema above) and `pending_tweet.json`. This has to be set up back in Cowork (not Claude Code) — it depends on the IBKR MCP connector and in-chat messaging, neither of which Claude Code has access to.
2. **End-to-end test**: once the above exists, confirm a full cycle — Cowork writes a real snapshot → local script picks it up within 15 min → data.json updates with real numbers → site reflects it.

## Privacy rule (non-negotiable, updated 2026-08-09)

Allowed to reach `data.json` / the public repo, per position: `ticker`, `percent` (allocation), `avg_price` (per-share cost basis), `day_change_pct`, `all_time_gain_pct`. Also allowed at the top level: `cash_percent` (cash as a % of total portfolio — a percentage, not a balance). These are all prices or percentages — never quantities or totals.

**Never allowed, at any layer:** share/contract quantity (position size), account value, total balance, total position dollar value ($ market value = price × quantity), or dollar P&L. The line is "per-share price or a percentage" (fine) vs. "anything requiring quantity to compute, or a dollar total" (forbidden) — quantity is the one number that must never leave the account boundary, since combined with price it reconstructs position size/value.

Enforce this at the point of writing `ibkr_snapshot.json` (Cowork side), not just in the frontend. `update_dashboard.py`'s `load_allocation()` only passes through the specific allowed keys by name — it does not forward unknown fields, so an accidental extra key from the Cowork task (e.g. `quantity`, `mkt_value`) is dropped, not leaked, but Cowork still shouldn't write it to the snapshot file at all.
