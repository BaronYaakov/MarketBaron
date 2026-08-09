import time

import httpx

from app.config import settings

X_API_BASE_URL = "https://api.x.com/2"
POSTS_PER_TICKER = 5
# X API's recent-search endpoint requires max_results between 10 and 100 —
# 10 is both the minimum and the cheapest option on the pay-per-read plan.
SEARCH_MAX_RESULTS = 10
# Cached aggressively — X reads are billed per-post on the pay-per-use plan,
# and posts don't need to be live, just periodically refreshed.
CACHE_TTL_SECONDS = 30 * 60

_cache: dict[str, tuple[float, list[dict]]] = {}


def _fetch_recent_posts(client: httpx.Client, ticker: str) -> list[dict]:
    resp = client.get(
        "/tweets/search/recent",
        params={
            "query": f"${ticker} -is:retweet lang:en",
            "max_results": SEARCH_MAX_RESULTS,
            "tweet.fields": "created_at",
            "expansions": "author_id",
            "user.fields": "username",
        },
        headers={"Authorization": f"Bearer {settings.x_api_bearer_token}"},
    )
    resp.raise_for_status()
    body = resp.json()

    usernames = {u["id"]: u["username"] for u in body.get("includes", {}).get("users", [])}
    posts = []
    for post in body.get("data", []):
        username = usernames.get(post["author_id"], "unknown")
        posts.append(
            {
                "text": post["text"],
                "author": username,
                "url": f"https://x.com/{username}/status/{post['id']}",
                "created_at": post["created_at"],
            }
        )
    return posts[:POSTS_PER_TICKER]


def get_posts_for_tickers(tickers: list[str]) -> dict[str, list[dict]]:
    now = time.monotonic()
    result: dict[str, list[dict]] = {}

    with httpx.Client(base_url=X_API_BASE_URL, timeout=10.0) as client:
        for ticker in tickers:
            cached = _cache.get(ticker)
            if cached and now - cached[0] < CACHE_TTL_SECONDS:
                result[ticker] = cached[1]
                continue

            posts = _fetch_recent_posts(client, ticker)
            _cache[ticker] = (now, posts)
            result[ticker] = posts

    return result
