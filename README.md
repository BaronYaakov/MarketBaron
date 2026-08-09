# IBKR Portfolio Dashboard

Public-facing dashboard: IBKR portfolio allocation % (percentages only, never dollar amounts), ticker-relevant news (Finnhub), and recent X posts. Fully static and public — no visitor login, no live backend calls per visitor.

## Architecture (current)

- **IBKR data**: official IBKR MCP connector (connected in Cowork) — no self-hosted gateway, no OAuth app, no manual session management.
- **Scheduled task** (runs in Cowork on a cron, e.g. every 30 min): pulls allocation from the IBKR connector and strips it to `{ticker, percent}` only, pulls news from Finnhub via direct API call, checks for new trades and drafts a tweet for owner approval, posts via the X API once approved, writes it all to `data.json`, and pushes that file to this repo.
- **Public site** (`site/`): plain static HTML/CSS/JS hosted on GitHub Pages, fetches `data.json` on load. No backend, safe for unlimited anonymous visitors, never triggers anything on visit.

> `backend/` and `frontend/` below are from an earlier, superseded plan (self-hosted IBKR Client Portal Gateway on a VPS). Left in place but not used going forward — the connector + scheduled-task approach replaced the need for a self-hosted gateway and manual IBKR re-auth entirely.

## Status

Pivoted to the connector + scheduled-task architecture. IBKR connector is connected. Next: `site/` (static frontend) and the scheduled task itself.

## Secrets

Root-level `.env` (gitignored) holds `FINNHUB_API_KEY`, `X_API_BEARER_TOKEN`, and `GITHUB_TOKEN` for the scheduled task. Copy `.env.example` → `.env` and fill in real values yourself — never paste real keys into chat. Only `.env.example` (placeholders) is tracked in git.

## Old build phases (superseded, kept for reference)

1. Scaffold — backend + frontend skeleton *(done, now unused)*
2. IBKR integration via self-hosted Client Portal Gateway *(replaced by the MCP connector)*
3. Finnhub news
4. X API
5. Dashboard frontend
6. Auth + secrets hardening
7. VPS deployment via Cloudflare Tunnel *(replaced by GitHub Pages)*
