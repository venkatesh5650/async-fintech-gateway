from locust import HttpUser, task, between
import random

class FinTechLoadTest(HttpUser):
    # Simulate aggressive scraping: users wait between 0.1 and 0.5 seconds between requests
    wait_time = between(0.1, 0.5)

    @task
    def assault_market_ingestion(self):
        """
        Bombard the webhook ingestion endpoint to test the Redis Token Bucket Firewall
        and PostgreSQL background task concurrency.
        """
        tickers = ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA"]
        
        # 1% ARCHITECT FIX: Payload now perfectly matches the Pydantic schema
        payload = {
            "ticker": random.choice(tickers),
            "asset_class": "EQUITY",  # <--- Added this required field
            "current_price": round(random.uniform(100.0, 500.0), 2),
            "volume": random.randint(1000, 50000)
        }
        
        # Fire request and evaluate response dynamically
        with self.client.post("/v1/market-data/ingest", json=payload, catch_response=True) as response:
            if response.status_code == 202:
                response.success()
            # 👇 COMMENT OUT OR REMOVE THIS BLOCK FOR THE VIDEO 👇
            # elif response.status_code == 429:
            #     response.success()
            # 👆 ============================================== 👆
            elif response.status_code == 500:
                response.failure("Server crash! Connection pool or background task failed.")
            else:
                # Now the 429s will fall down to here and show up as red failures!
                error_msg = f"Blocked by Firewall: {response.status_code}"
                response.failure(error_msg)