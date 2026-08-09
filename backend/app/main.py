from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.finnhub import get_news_for_tickers
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
    try:
        tickers = [item["ticker"] for item in get_allocation()]
    except IBKRAuthRequired:
        raise HTTPException(
            status_code=503,
            detail="IBKR gateway session is not authenticated — re-authorize via the gateway",
        )
    return {"status": "ok", "news": get_news_for_tickers(tickers)}


@app.get("/posts")
def posts():
    # Phase 4: fetch cached recent X posts for current holdings
    return {"status": "not_implemented"}
