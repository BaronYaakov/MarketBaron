from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    # Phase 2: fetch positions from the IBKR Client Portal Gateway and compute % allocation
    return {"status": "not_implemented"}


@app.get("/news")
def news():
    # Phase 3: fetch ticker-relevant news from Finnhub
    return {"status": "not_implemented"}


@app.get("/posts")
def posts():
    # Phase 4: fetch cached recent X posts for current holdings
    return {"status": "not_implemented"}
