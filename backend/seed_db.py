import requests
import time

# Your live production URL
# URL = "https://fintech-api-gateway-m2yl.onrender.com/v1/market-data/ingest"
URL = "http://localhost:8000/v1/market-data/ingest"

# A clear upward trend that a quantitative LLM will instantly recognize as a BUY signal
trend_prices = [185.00, 188.50, 192.00, 195.50, 198.20]

print("🚀 Initiating Cloud Database Seeding Protocol...")

for price in trend_prices:
    payload = {
        "ticker": "AAPL",
        "asset_class": "EQUITY",
        "current_price": price,
        "volume": 52000000
    }
    
    try:
        response = requests.post(URL, json=payload)
        print(f"✅ Injected AAPL @ ${price} | Status: {response.status_code}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")
        
    # Wait 2 seconds to ensure database timestamps are cleanly sequential
    time.sleep(2)

print("🏁 Seeding Complete.")