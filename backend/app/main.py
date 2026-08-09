from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.ibkr import IBKRAuthRequired, get_allocation

app = FastAPI(title="IBKR Portfolio Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/portfolio/allocation")
def portfolio_allocation():
    try:
        return {"status": "ok", "allocation": get_allocation()}
    except IBKRAuthRequired:
        raise HTTPException(
            status_code=503,
            detail="IBKR gateway session is not authenticated — re-authorize via the gateway",
        )


@app.get("/news")
def news():
    # Phase 3: fetch ticker-relevant news from Finnhub
    return {"status": "not_implemented"}


@app.get("/posts")
def posts():
    # Phase 4: fetch cached recent X posts for current holdings
    return {"status": "not_implemented"}
