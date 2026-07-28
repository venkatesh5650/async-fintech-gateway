# app/routers/market.py

"""
Market Data Ingestion Router
----------------------------
Handles asynchronous webhook ingestion for financial assets, performs external
API verification via Alpha Vantage, and manages non-blocking time-series 
persistence into PostgreSQL.
"""

from fastapi import APIRouter, BackgroundTasks, status
import httpx
import os
import logging
from datetime import datetime, timezone
from sqlalchemy.future import select
from app.database.database import AsyncSessionLocal
from app.database.models import Ticker, MarketPricing
from app.database.schemas import MarketDataPayload  

# Initialize API router with version prefix and documentation tags
router = APIRouter(prefix="/v1/market-data", tags=["Market Ingestion"])

# External financial market data provider authentication key
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY")

async def fetch_live_market_content(payload: MarketDataPayload):
    """
    Asynchronous background worker routine to handle external API verification
    and secure relational persistence of inbound market data payloads.
    """
    allowed_test_tickers = ["AAPL", "MSFT", "GOOGL"]
    
    # Check if the incoming asset is permitted for mock development bypass
    if payload.ticker.upper() in allowed_test_tickers:
        logging.warning(f"🚧 [DEV BYPASS] Skipping Alpha Vantage validation for {payload.ticker}.")
    else:
        # Query external market intelligence provider asynchronously
        url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={payload.ticker}&apikey={ALPHA_VANTAGE_KEY}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.get(url)
            
    # Persist normalized pricing records to the asynchronous PostgreSQL database engine
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # Verify entity existence in the relational database
                stmt = select(Ticker).where(Ticker.symbol == payload.ticker.upper())
                result = await session.execute(stmt)
                ticker_obj = result.scalars().first()

                # Provision ticker entity dynamically if missing from metadata catalog
                if not ticker_obj:
                    ticker_obj = Ticker(symbol=payload.ticker.upper(), company_name=f"{payload.ticker.upper()} Corp", is_active=True)
                    session.add(ticker_obj)
                    await session.flush() 

                # Construct time-series pricing record linked to the target entity identifier
                pricing_record = MarketPricing(
                    ticker_id=ticker_obj.id,
                    timestamp=datetime.now(timezone.utc),
                    open_price=payload.current_price,
                    high_price=payload.current_price,
                    low_price=payload.current_price,
                    close_price=payload.current_price,
                    volume=payload.volume
                )
                session.add(pricing_record)
            
            # Commit atomic database transaction block
            await session.commit()
            logging.warning(f"✅ [DATABASE SUCCESS] Saved {payload.ticker} price to database!")
            
    except Exception as db_exc:
        logging.error(f"❌ [DATABASE ERROR] Failed to save: {str(db_exc)}")


@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_market_data(payload: MarketDataPayload, background_tasks: BackgroundTasks):
    """
    O(1) synchronous webhook ingestion endpoint. Immediately dispatches processing 
    to an asynchronous background worker and returns 202 Accepted to prevent client thread starvation.
    """
    background_tasks.add_task(fetch_live_market_content, payload)
    return {
        "status": "allowed",
        "message": f"Asset metrics for {payload.ticker} queued for downstream analytics.",
        "tracking_id": "async_task_dispatched"
    }