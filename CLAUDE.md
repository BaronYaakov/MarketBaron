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
Cowork scheduled task (runs while Cowork app is open, e.g. every 15-30 min)
  → calls IBKR MCP connector → get_portfolio_allocation / get_orders
  → strips to {ticker, percent} ONLY — never balances, account value, or trade $ amounts
  → writes ibkr_snapshot.json to this repo folder (local file write, no network needed)
  → checks for new trades vs last snapshot
  → if new trade: drafts tweet text, messages Jake in chat for approval
  → on approval: writes pending_tweet.json (text + trade info) to this repo folder
     (Cowork CANNOT post to X itself — sandbox blocks it — so it just queues the approved text)

Local script (built here, scheduled via Windows Task Scheduler — runs independently of Cowork)
  → reads ibkr_snapshot.json (written by the Cowork task above)
  → fetches news per held ticker from Finnhub (real API call, works locally)
  → checks pending_tweet.json — if present and not yet posted, posts it via the X API,
    records the returned tweet id/text/timestamp, deletes/marks pending_tweet.json as consumed
  → maintains a rolling list of recently-posted tweets (own small JSON store, e.g. posted_tweets.json)
  → assembles final data.json = { allocation: [...], news: [...], recent_posts: [...] }
  → git commit + push data.json (and posted_tweets.json) to BaronYaakov/MarketBaron
```

GitHub Pages serves `index.html` (in this repo, root or `/site`) which fetches `data.json` on load and renders three panels: allocation chart, news list, recent posts feed. Purely static — visiting the page never triggers anything.

## Current state (as of handoff)

- IBKR MCP connector: **connected** in Cowork.
- GitHub repo `BaronYaakov/MarketBaron`: **created**, public, empty, Pages **not yet enabled** (Settings → Pages → Deploy from branch `main`, folder `/root`).
- `.env` at project root: **populated** with real `FINNHUB_API_KEY`, `X_API_BEARER_TOKEN`, `GITHUB_TOKEN` (a `gho_` prefixed token — verify its scope covers repo contents read/write before relying on it), `GITHUB_REPO=BaronYaakov/MarketBaron`. This file is gitignored — confirmed never committed. **Never commit it, never print its contents to logs.**
- `backend/` and `frontend/` folders: **leftover from an earlier, abandoned plan** (self-hosted IBKR Client Portal Gateway on a VPS). Not part of the current design. Safe to ignore or eventually delete (ask Jake before deleting).
- `validate_apis.ps1` at root: leftover diagnostic script from confirming the network blocker. No longer needed, safe to remove.
- No scheduled task exists yet in Cowork for the real IBKR-polling pipeline (only a one-time validation task ran, which auto-disabled).
- No local script exists yet for the Finnhub/X/GitHub piece.
- No `index.html` / static site exists yet.

## What's left to build

1. **Local script** (Python is fine, `backend/` already has a venv pattern to borrow from if useful, but this doesn't need FastAPI — it's a one-shot script, not a server):
   - Read `ibkr_snapshot.json`, call Finnhub (`FINNHUB_API_KEY` from `.env`), call X API for posting (`X_API_BEARER_TOKEN`), git commit/push using `GITHUB_TOKEN`.
   - Handle the case where `ibkr_snapshot.json` doesn't exist yet (Cowork task hasn't run) or `pending_tweet.json` doesn't exist (no trade to post) gracefully — these are the common case, not errors.
2. **Windows Task Scheduler entry** to run the local script every 15–30 min, independent of whether Cowork is open.
3. **Static site** (`index.html` + `style.css` + `app.js` or similar, no framework needed): fetch `data.json`, render allocation chart (percent by ticker — a simple bar or donut is fine, e.g. Chart.js from CDN), news panel, recent-posts feed.
4. **Cowork scheduled task**: recurring, calls the IBKR connector, does the strip-to-percent + trade-diff + approval-message logic described above, writes `ibkr_snapshot.json` and `pending_tweet.json`. This part should be set up back in Cowork (not Claude Code), since it depends on the IBKR MCP connector and in-chat messaging — flag this back to Jake rather than trying to build it here.
5. **Enable GitHub Pages** on the repo once `index.html` exists.
6. **End-to-end test**: confirm a full cycle — Cowork writes snapshot → local script picks it up → data.json updates → site reflects it.

## Privacy rule (non-negotiable)

Only `{ticker, percent}` may ever reach `data.json` or the public repo. No account balance, total value, or dollar trade size, at any layer. Enforce this at the point of writing `ibkr_snapshot.json`, not just in the frontend.
