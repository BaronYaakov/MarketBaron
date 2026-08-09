import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    ibkr_gateway_url: str = os.getenv("IBKR_GATEWAY_URL", "https://localhost:5000/v1/api")
    finnhub_api_key: str = os.getenv("FINNHUB_API_KEY", "")
    x_api_bearer_token: str = os.getenv("X_API_BEARER_TOKEN", "")
    dashboard_username: str = os.getenv("DASHBOARD_USERNAME", "")
    dashboard_password: str = os.getenv("DASHBOARD_PASSWORD", "")


settings = Settings()
