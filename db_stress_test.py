import asyncio
import random
from datetime import datetime, timezone, timedelta
from database import AsyncSessionLocal
from crud import upsert_market_data
import os

async def simulate_hft_worker(worker_id: int, burst_size: int):
    """Simulates a single background worker ingesting a burst of tick data."""
    async with AsyncSessionLocal() as session:
        payload = []
        base_time = datetime.now(timezone.utc)
        
        for i in range(burst_size):
            
            time_offset = i 
            
            payload.append({
                "ticker_id": 1, # Points to the AAPL row we just inserted
                "timestamp": base_time + timedelta(milliseconds=time_offset * 100),
                "open_price": round(random.uniform(150, 155), 4),
                "high_price": round(random.uniform(150, 155), 4),
                "low_price": round(random.uniform(150, 155), 4),
                "close_price": round(random.uniform(150, 155), 4),
                "volume": random.randint(1000, 50000)
            })
            
        await upsert_market_data(session, payload)
        print(f"Worker {worker_id}: Successfully upserted {burst_size} payloads.")

async def main():
    print("🚀 Initiating High-Frequency Concurrency Stress Test...")
    
    # Spawn 50 concurrent workers, each attempting to insert 100 rows simultaneously
    # This will immediately saturate your 20-connection pool and force the max_overflow
    workers = [simulate_hft_worker(i, 100) for i in range(50)]
    
    # Execute all workers concurrently
    await asyncio.gather(*workers)
    
    print("✅ Stress Test Complete. Zero deadlocks detected.")

if __name__ == "__main__":
    asyncio.run(main())