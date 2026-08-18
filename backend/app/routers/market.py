from fastapi import APIRouter, BackgroundTasks, status, Depends
import httpx
import os
import logging
from datetime import datetime, timezone
from sqlalchemy.future import select
from app.database.database import AsyncSessionLocal
from app.database.models import Ticker, MarketPricing
from app.database.schemas import MarketDataPayload
from app.core.resilience import async_retry
from app.core.limiter import RateLimiter  

router = APIRouter(prefix="/v1/market-data", tags=["Market Ingestion"])
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY")

#  (Strict limit: 5 requests per minute per IP)
market_firewall = RateLimiter(requests_per_minute=5)

@async_retry(retries=3, delay=1.0, backoff=2.0)
async def _fetch_alpha_vantage_data(ticker: str):
    """
    Protected external network call with automated exponential backoff.
    """
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={ticker}&apikey={ALPHA_VANTAGE_KEY}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()

async def fetch_live_market_content(payload: MarketDataPayload):
    """
    Background worker routine for external verification and relational persistence.
    """
    allowed_test_tickers = ["AAPL", "MSFT", "GOOGL"]
    
    if payload.ticker.upper() in allowed_test_tickers:
        logging.warning(f"🚧 [DEV BYPASS] Skipping Alpha Vantage validation for {payload.ticker}.")
    else:
        try:
            await _fetch_alpha_vantage_data(payload.ticker)
        except Exception as e:
            logging.error(f"❌ [EXTERNAL API ERROR] Failed to fetch market data after retries: {str(e)}")
            return

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                stmt = select(Ticker).where(Ticker.symbol == payload.ticker.upper())
                result = await session.execute(stmt)
                ticker_obj = result.scalars().first()

                if not ticker_obj:
                    ticker_obj = Ticker(
                        symbol=payload.ticker.upper(), 
                        company_name=f"{payload.ticker.upper()} Corp", 
                        is_active=True
                    )
                    session.add(ticker_obj)
                    await session.flush() 

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
            
            await session.commit()
            logging.warning(f"✅ [DATABASE SUCCESS] Saved {payload.ticker} price to database!")
            
    except Exception as db_exc:
        logging.error(f"❌ [DATABASE ERROR] Failed to save: {str(db_exc)}")


@router.post(
    "/ingest", 
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(market_firewall)]
)
async def ingest_market_data(payload: MarketDataPayload, background_tasks: BackgroundTasks):
    """
    Asynchronous webhook ingestion endpoint returning 202 Accepted.
    """
    background_tasks.add_task(fetch_live_market_content, payload)
    return {
        "status": "allowed",
        "message": f"Asset metrics for {payload.ticker} queued for downstream analytics.",
        "tracking_id": "async_task_dispatched"
    }