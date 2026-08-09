import time
from datetime import date, timedelta

import httpx

from app.config import settings

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
NEWS_LOOKBACK_DAYS = 7
ITEMS_PER_TICKER = 5
CACHE_TTL_SECONDS = 15 * 60

# In-memory cache keyed by ticker: {ticker: (fetched_at, news_items)}.
# Single-process, single-user app — good enough to stay under the Finnhub
# free-tier rate limit without adding infra like Redis.
_cache: dict[str, tuple[float, list[dict]]] = {}


def _fetch_company_news(client: httpx.Client, ticker: str) -> list[dict]:
    today = date.today()
    resp = client.get(
        "/company-news",
        params={
            "symbol": ticker,
            "from": (today - timedelta(days=NEWS_LOOKBACK_DAYS)).isoformat(),
            "to": today.isoformat(),
            "token": settings.finnhub_api_key,
        },
    )
    resp.raise_for_status()
    articles = resp.json()
    return [
        {
            "headline": a["headline"],
            "source": a["source"],
            "url": a["url"],
            "datetime": a["datetime"],
        }
        for a in articles[:ITEMS_PER_TICKER]
    ]


def get_news_for_tickers(tickers: list[str]) -> dict[str, list[dict]]:
    now = time.monotonic()
    result: dict[str, list[dict]] = {}

    with httpx.Client(base_url=FINNHUB_BASE_URL, timeout=10.0) as client:
        for ticker in tickers:
            cached = _cache.get(ticker)
            if cached and now - cached[0] < CACHE_TTL_SECONDS:
                result[ticker] = cached[1]
                continue

            news_items = _fetch_company_news(client, ticker)
            _cache[ticker] = (now, news_items)
            result[ticker] = news_items

    return result
