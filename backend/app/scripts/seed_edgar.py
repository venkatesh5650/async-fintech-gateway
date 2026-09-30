import asyncio
from app.database.database import AsyncSessionLocal
from app.database.models import DocumentChunk
from sqlalchemy import delete
from app.workers.edgar_worker import sync_edgar_filings_for_ticker, TRACKED_TICKERS, redis_client


async def run_seed():
    print("🧹 Cleaning up old chunks from PostgreSQL...")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(delete(DocumentChunk))

    print("🧹 Cleaning up old metadata from Redis...")
    keys = await redis_client.keys("doc:*")
    if keys:
        await redis_client.delete(*keys)

    keys = await redis_client.keys("docs:*")
    if keys:
        await redis_client.delete(*keys)

    print("🚀 Running EDGAR sync for all tracked tickers...")
    for ticker in TRACKED_TICKERS:
        print(f"Syncing {ticker}...")
        res = await sync_edgar_filings_for_ticker(ticker, "10-K")
        print(f"✅ {ticker} Synced. Generated {res['chunks_generated']} chunks.")


if __name__ == "__main__":
    asyncio.run(run_seed())
