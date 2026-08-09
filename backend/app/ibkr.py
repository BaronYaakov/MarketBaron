import httpx

from app.config import settings


class IBKRAuthRequired(Exception):
    """Raised when the IBKR Client Portal Gateway session isn't authenticated."""


def _client() -> httpx.Client:
    # The gateway serves a self-signed cert on localhost; verification is disabled
    # for that reason only — this client only ever talks to the local gateway.
    return httpx.Client(base_url=settings.ibkr_gateway_url, verify=False, timeout=10.0)


def is_authenticated() -> bool:
    with _client() as client:
        resp = client.post("/iserver/auth/status", json={})
        resp.raise_for_status()
        return resp.json().get("authenticated", False)


def get_account_id() -> str:
    with _client() as client:
        resp = client.get("/portfolio/accounts")
        resp.raise_for_status()
        accounts = resp.json()
        if not accounts:
            raise IBKRAuthRequired("No IBKR accounts returned")
        return accounts[0]["accountId"]


def get_positions(account_id: str) -> list[dict]:
    positions = []
    with _client() as client:
        page = 0
        while True:
            resp = client.get(f"/portfolio/{account_id}/positions/{page}")
            resp.raise_for_status()
            page_positions = resp.json()
            if not page_positions:
                break
            positions.extend(page_positions)
            page += 1
    return positions


def get_allocation() -> list[dict]:
    """Returns [{"ticker": str, "percent": float}, ...]. Percentages only — no
    dollar values are ever included, per the public dashboard's data-exposure rule."""
    if not is_authenticated():
        raise IBKRAuthRequired("IBKR gateway session is not authenticated")

    account_id = get_account_id()
    positions = get_positions(account_id)

    total_value = sum(p["mktValue"] for p in positions)
    if total_value <= 0:
        return []

    allocation = [
        {
            "ticker": p["contractDesc"],
            "percent": round(p["mktValue"] / total_value * 100, 2),
        }
        for p in positions
    ]
    allocation.sort(key=lambda item: item["percent"], reverse=True)
    return allocation
