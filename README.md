# IBKR Portfolio Dashboard

Public-facing dashboard: IBKR portfolio allocation % (percentages only, never dollar amounts), ticker-relevant news (Finnhub), and recent X posts. No visitor login — the dashboard is fully open. A separate, narrow private panel exists only for the owner to complete IBKR's periodic re-authorization (see below).

## Structure

- `backend/` — Python (FastAPI) API. Runs the IBKR Client Portal Gateway integration, Finnhub client, and X API client.
- `frontend/` — Next.js (TypeScript) dashboard UI.

## Status

Phase 1 (scaffold) complete — no real integrations wired up yet. See phase list below.

## Setup

### Backend

```
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env  # fill in real values
uvicorn app.main:app --reload
```

Health check: http://localhost:8000/health

### Frontend

```
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Dashboard: http://localhost:3000

## IBKR auth — important

Retail IBKR accounts don't support OAuth. Access is only via the **Client Portal Gateway**, which requires a manual login (username/password + IB Key push approval on your phone) roughly every 24h or whenever the gateway restarts. This project cannot automate that step away — even once deployed, you'll periodically need to re-approve the session yourself.

## Build phases

1. **Scaffold** — repo structure, backend + frontend skeleton, `.env.example`, README. *(this phase)*
2. **IBKR integration** — `/portfolio/accounts` + positions → % allocation. Requires running the gateway locally and completing the 2FA push yourself.
3. **Finnhub news** — ticker-relevant news, cached against free-tier rate limits.
4. **X API** — pull-and-cache recent posts on a schedule.
5. **Dashboard frontend** — wire allocation chart + news panel + posts feed to the backend.
6. **Auth + secrets hardening** — build the private IBKR re-auth panel (not a general login/admin gate), confirm dollar amounts/account value never leak into public API responses or UI, confirm nothing sensitive is hardcoded/logged.
7. **Deployment** — VPS setup, pm2/systemd to keep the IBKR gateway + backend alive, document the re-approval cadence. Frontend deployed to **Cloudflare Pages**. Backend on the VPS exposed via **Cloudflare Tunnel** (cloudflared) for free HTTPS/CDN/DDoS protection without opening firewall ports.

## Secrets

Never commit real API keys or IBKR credentials. Only `.env.example` files (placeholders) are tracked; real `.env` / `.env.local` files are gitignored.
