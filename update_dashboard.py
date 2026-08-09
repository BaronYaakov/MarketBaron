"""
MarketBaron dashboard updater.

Runs independently of Cowork (scheduled locally via Windows Task Scheduler).
Reads ibkr_snapshot.json (written by the Cowork task), fetches news per held
ticker from Finnhub, posts an approved pending tweet to X if one is queued,
assembles data.json, and pushes it (plus posted_tweets.json) to GitHub.

Safe to run with no ibkr_snapshot.json / pending_tweet.json present — both
are the common case, not errors.
"""
import base64
import datetime
import json
import subprocess
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
X_API_BEARER_TOKEN = os.environ.get("X_API_BEARER_TOKEN", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "")

SNAPSHOT_PATH = BASE_DIR / "ibkr_snapshot.json"
PENDING_TWEET_PATH = BASE_DIR / "pending_tweet.json"
POSTED_TWEETS_PATH = BASE_DIR / "posted_tweets.json"
DATA_JSON_PATH = BASE_DIR / "data.json"

MAX_NEWS_PER_TICKER = 3
MAX_RECENT_POSTS = 10
NEWS_LOOKBACK_DAYS = 7


def log(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {redact(msg)}", flush=True)


def redact(msg: str) -> str:
    for secret in (GITHUB_TOKEN, X_API_BEARER_TOKEN, FINNHUB_API_KEY):
        if secret:
            msg = msg.replace(secret, "***")
    return msg


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log(f"WARNING: failed to read {path.name}: {e} — using default")
        return default



# Fields allowed to pass through from ibkr_snapshot.json, per the privacy
# rule in CLAUDE.md: prices and percentages only, never quantity or a dollar
# total (quantity x price = position value, which must never leave the
# account boundary). Unknown/unlisted keys in a snapshot entry are dropped,
# not forwarded, even if Cowork accidentally writes them.
OPTIONAL_ALLOCATION_FIELDS = {
    "avg_price": 2,        # per-share cost basis, USD — a price, not a total
    "day_change_pct": 2,   # ideally IBKR-sourced; see fetch_day_change() fallback
    "all_time_gain_pct": 2,
}


def load_cash_percent() -> float | None:
    """Optional top-level cash_percent from ibkr_snapshot.json (dict form
    only). A percentage of the portfolio, not a dollar amount — allowed."""
    raw = load_json(SNAPSHOT_PATH, None)
    if not isinstance(raw, dict):
        return None
    value = raw.get("cash_percent")
    return round(float(value), 2) if isinstance(value, (int, float)) else None


def load_allocation() -> list[dict]:
    """Read ibkr_snapshot.json and strip to ticker/percent plus only the
    allow-listed optional fields above."""
    raw = load_json(SNAPSHOT_PATH, None)
    if raw is None:
        return []
    entries = raw if isinstance(raw, list) else raw.get("allocation", [])
    allocation = []
    for entry in entries:
        try:
            parsed = {
                "ticker": str(entry["ticker"]).upper(),
                "percent": round(float(entry["percent"]), 4),
            }
            for field, decimals in OPTIONAL_ALLOCATION_FIELDS.items():
                value = entry.get(field)
                if isinstance(value, (int, float)):
                    parsed[field] = round(float(value), decimals)
            if "day_change_pct" in parsed:
                parsed["day_change_source"] = "ibkr"
            allocation.append(parsed)
        except (KeyError, TypeError, ValueError):
            log(f"WARNING: skipping malformed allocation entry: {entry!r}")
    return allocation


def fetch_logo_url(ticker: str) -> str | None:
    """Public company info (logo image URL) via Finnhub's profile endpoint —
    not account data."""
    if not FINNHUB_API_KEY:
        return None
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/stock/profile2",
            params={"symbol": ticker, "token": FINNHUB_API_KEY},
            timeout=15,
        )
        resp.raise_for_status()
        profile = resp.json()
    except requests.RequestException as e:
        log(f"WARNING: Finnhub profile fetch failed for {ticker}: {e}")
        return None
    logo = profile.get("logo") if isinstance(profile, dict) else None
    return logo or None


def fetch_day_change(ticker: str) -> float | None:
    """Public market data (the stock's own daily % move) — not account data,
    so it doesn't conflict with the {ticker, percent}-only privacy rule."""
    if not FINNHUB_API_KEY:
        return None
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": ticker, "token": FINNHUB_API_KEY},
            timeout=15,
        )
        resp.raise_for_status()
        quote = resp.json()
    except requests.RequestException as e:
        log(f"WARNING: Finnhub quote fetch failed for {ticker}: {e}")
        return None
    dp = quote.get("dp")
    return round(float(dp), 2) if isinstance(dp, (int, float)) else None


def fetch_news_for_ticker(ticker: str) -> list[dict]:
    if not FINNHUB_API_KEY:
        log("WARNING: FINNHUB_API_KEY missing — skipping news fetch")
        return []
    today = datetime.date.today()
    since = today - datetime.timedelta(days=NEWS_LOOKBACK_DAYS)
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/company-news",
            params={
                "symbol": ticker,
                "from": since.isoformat(),
                "to": today.isoformat(),
                "token": FINNHUB_API_KEY,
            },
            timeout=15,
        )
        resp.raise_for_status()
        items = resp.json()
    except requests.RequestException as e:
        log(f"WARNING: Finnhub news fetch failed for {ticker}: {e}")
        return []
    if not isinstance(items, list):
        return []
    news = []
    for item in items[:MAX_NEWS_PER_TICKER]:
        news.append({
            "ticker": ticker,
            "headline": item.get("headline", ""),
            "source": item.get("source", ""),
            "url": item.get("url", ""),
            "datetime": item.get("datetime", 0),
        })
    return news


def fetch_all_news(tickers: list[str]) -> list[dict]:
    news = []
    for ticker in tickers:
        news.extend(fetch_news_for_ticker(ticker))
    news.sort(key=lambda n: n.get("datetime", 0), reverse=True)
    return news


def post_pending_tweet(posted_tweets: list[dict]) -> list[dict]:
    """If pending_tweet.json exists, post it via the X API. On success,
    record it in posted_tweets and delete the pending file. On failure,
    leave the pending file in place so the next run retries."""
    pending = load_json(PENDING_TWEET_PATH, None)
    if pending is None:
        return posted_tweets

    text = pending.get("text", "")
    if not text:
        log("WARNING: pending_tweet.json present but has no text — removing it")
        PENDING_TWEET_PATH.unlink(missing_ok=True)
        return posted_tweets

    if not X_API_BEARER_TOKEN:
        log("WARNING: X_API_BEARER_TOKEN missing — cannot post pending tweet, leaving it queued")
        return posted_tweets

    try:
        resp = requests.post(
            "https://api.twitter.com/2/tweets",
            headers={
                "Authorization": f"Bearer {X_API_BEARER_TOKEN}",
                "Content-Type": "application/json",
            },
            json={"text": text},
            timeout=15,
        )
        resp.raise_for_status()
        tweet_data = resp.json().get("data", {})
    except requests.RequestException as e:
        body = getattr(e.response, "text", "") if getattr(e, "response", None) is not None else ""
        log(f"ERROR: failed to post pending tweet: {e} {body}".strip())
        return posted_tweets

    entry = {
        "id": tweet_data.get("id", ""),
        "text": tweet_data.get("text", text),
        "posted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "trade": pending.get("trade"),
    }
    posted_tweets = [entry] + posted_tweets
    posted_tweets = posted_tweets[:MAX_RECENT_POSTS]
    log(f"Posted tweet id={entry['id']}")

    PENDING_TWEET_PATH.unlink(missing_ok=True)
    return posted_tweets


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    return subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True, env=env, **kwargs)


def git_commit_and_push() -> None:
    if not GITHUB_TOKEN or not GITHUB_REPO:
        log("WARNING: GITHUB_TOKEN/GITHUB_REPO missing — skipping git push")
        return

    status = run(["git", "status", "--porcelain", "--", "data.json", "posted_tweets.json"])
    if not status.stdout.strip():
        log("No changes to data.json/posted_tweets.json — skipping commit")
        return

    run(["git", "add", "data.json", "posted_tweets.json"])
    commit_msg = f"Update dashboard data {datetime.datetime.now(datetime.timezone.utc).isoformat()}"
    commit = run(["git", "commit", "-m", commit_msg])
    if commit.returncode != 0:
        log(f"ERROR: git commit failed: {commit.stderr.strip()}")
        return

    push_url = f"https://x-access-token:{GITHUB_TOKEN}@github.com/{GITHUB_REPO}.git"
    push = run(["git", "push", push_url, "HEAD:main"])
    if push.returncode != 0:
        log(f"ERROR: git push failed: {push.stderr.strip()}")
        return
    log("Pushed data.json/posted_tweets.json to GitHub")


def main() -> int:
    if not SNAPSHOT_PATH.exists():
        log("No ibkr_snapshot.json yet — Cowork task hasn't run. Nothing to do.")
        return 0

    allocation = load_allocation()
    tickers = [a["ticker"] for a in allocation]
    log(f"Loaded allocation for {len(tickers)} ticker(s): {tickers}")

    for a in allocation:
        if "day_change_pct" not in a:
            a["day_change_pct"] = fetch_day_change(a["ticker"])
            a["day_change_source"] = "finnhub_estimate" if a["day_change_pct"] is not None else None
        a["logo_url"] = fetch_logo_url(a["ticker"])

    news = fetch_all_news(tickers)
    log(f"Fetched {len(news)} news item(s)")

    posted_tweets = load_json(POSTED_TWEETS_PATH, [])
    posted_tweets = post_pending_tweet(posted_tweets)

    data = {
        "allocation": allocation,
        "cash_percent": load_cash_percent(),
        "news": news,
        "recent_posts": posted_tweets,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    with DATA_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    with POSTED_TWEETS_PATH.open("w", encoding="utf-8") as f:
        json.dump(posted_tweets, f, indent=2)

    git_commit_and_push()
    return 0


if __name__ == "__main__":
    sys.exit(main())
