import asyncio
import httpx
import time

TARGET_URL="http://localhost:8000/v1/market-data/ingest"

# 5 Core distinct payloads to evaluate different systemic states
BASE_PAYLOADS = [
    {"ticker": "AAPL", "asset_class": "EQUITY", "current_price": 185.50, "volume": 5000000},
    {"ticker": "BTC", "asset_class": "CRYPTO", "current_price": 65000.00, "volume": 1200000},
    {"ticker": "MALFORMED_TICKER_TEST", "asset_class": "EQUITY", "current_price": 10.0, "volume": 100},  # Triggers 400
    {"ticker": "EURUSD", "asset_class": "FOREX", "current_price": 1.09, "volume": 95000000},
    {"ticker": "TSLA", "asset_class": "BAD_ASSET", "current_price": 175.0, "volume": 2000000},  # Triggers 400
]


# Multiply the batch to fire 50 concurrent requests instantly
TEST_PAYLOADS=BASE_PAYLOADS * 10

async def fire_packet(client:httpx.AsyncClient,payload:dict,req_id:int):
    try:
        response=await client.post(TARGET_URL,json=payload)
        print(f"[Packet {req_id:02d}] Status: {response.status_code} | Body: {response.json()}")
       
    except Exception as e:
        print(f"[Packet {req_id:02d}] Operational Error: {e}")


async def main():
    print(f"🚀 Initializing Concurrency Stress Test: Launching {len(TEST_PAYLOADS)} tasks...")
    start=time.perf_counter()
    print(f"")

    async with httpx.AsyncClient() as client:
        tasks=[fire_packet(client,payload,i) for i, payload in enumerate(TEST_PAYLOADS)]
        await asyncio.gather(*tasks)

    end=time.perf_counter()
    print(f"\n⚡ Concurrency Cycle Completed in {end - start:.2f} seconds.")

if __name__=="__main__":
    asyncio.run(main())



    
