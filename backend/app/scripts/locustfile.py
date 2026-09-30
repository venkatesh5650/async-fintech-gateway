import os
import random
from locust import HttpUser, task, between

M2M_API_KEY = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key_2026")
TICKERS = ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA", "AMD", "META"]


class FinTechLoadTest(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(3)
    def submit_batch_intelligence(self):
        sample_size = random.randint(2, 5)
        selected_tickers = random.sample(TICKERS, sample_size)
        payload = {"tickers": selected_tickers}
        headers = {
            "Content-Type": "application/json",
            "X-N8N-API-KEY": M2M_API_KEY,
        }

        with self.client.post(
            "/v1/intelligence/batch",
            json=payload,
            headers=headers,
            catch_response=True,
            name="/v1/intelligence/batch",
        ) as response:
            if response.status_code in (200, 202):
                response.success()
            elif response.status_code == 429:
                response.success()
            elif response.status_code >= 500:
                response.failure(f"Server error: {response.status_code}")
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(3)
    def assault_market_ingestion(self):
        payload = {
            "ticker": random.choice(TICKERS),
            "asset_class": "EQUITY",
            "current_price": round(random.uniform(100.0, 500.0), 2),
            "volume": random.randint(1000, 50000),
        }

        with self.client.post(
            "/v1/market-data/ingest",
            json=payload,
            catch_response=True,
            name="/v1/market-data/ingest",
        ) as response:
            if response.status_code in (200, 202, 429):
                response.success()
            elif response.status_code >= 500:
                response.failure(f"Server crash on market ingestion: {response.status_code}")
            else:
                response.failure(f"Blocked or error: {response.status_code}")

    @task(2)
    def query_analytics_metrics(self):
        ticker = random.choice(TICKERS)
        headers = {"X-N8N-API-KEY": M2M_API_KEY}
        with self.client.get(
            f"/v1/analytics/{ticker}",
            headers=headers,
            catch_response=True,
            name="/v1/analytics/[ticker]",
        ) as response:
            if response.status_code in (200, 404, 429):
                response.success()
            else:
                response.failure(f"Analytics query failed: {response.status_code}")

    @task(1)
    def inspect_system_telemetry(self):
        endpoints = [
            "/v1/intelligence/stream-health",
            "/v1/intelligence/cache-health",
            "/health",
        ]
        endpoint = random.choice(endpoints)
        with self.client.get(
            endpoint,
            catch_response=True,
            name=endpoint,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Telemetry check failed: {response.status_code}")
