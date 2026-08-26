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

    pricing_data = None
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
                await session.flush()

                # Safely copy values to a dictionary within the active transaction
                pricing_data = {
                    "type": "market_data",
                    "ticker": payload.ticker.upper(),
                    "timestamp": pricing_record.timestamp.isoformat(),
                    "open": float(pricing_record.open_price),
                    "high": float(pricing_record.high_price),
                    "low": float(pricing_record.low_price),
                    "close": float(pricing_record.close_price),
                    "volume": int(pricing_record.volume)
                }
            
            await session.commit()
            logging.warning(f"✅ [DATABASE SUCCESS] Saved {payload.ticker} price to database!")
            
        # Broadcast the data frame to all active websocket clients
        if pricing_data:
            from app.routers.websocket import manager
            await manager.broadcast(pricing_data)
            logging.warning(f"📡 [WEBSOCKET BROADCAST] Emitted telemetry for {payload.ticker}: {pricing_data}")
            
    except Exception as db_exc:
        logging.error(f"❌ [DATABASE ERROR] Failed to save or broadcast: {str(db_exc)}")


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


@router.get(
    "/history/{ticker}", 
    status_code=status.HTTP_200_OK
)
async def get_market_history(ticker: str):
    """
    CQRS Query Edge: Retrieve time-series historical pricing data for a ticker symbol.
    """
    async with AsyncSessionLocal() as session:
        # 1. Resolve ticker symbol to id
        ticker_stmt = select(Ticker).where(Ticker.symbol == ticker.upper())
        ticker_result = await session.execute(ticker_stmt)
        ticker_obj = ticker_result.scalars().first()
        
        if not ticker_obj:
            return []
            
        # 2. Query market_pricing for that ticker, sorted chronologically (ascending)
        pricing_stmt = (
            select(MarketPricing)
            .where(MarketPricing.ticker_id == ticker_obj.id)
            .order_by(MarketPricing.timestamp.asc())
        )
        pricing_result = await session.execute(pricing_stmt)
        pricing_list = pricing_result.scalars().all()
        
        # 3. Format response to match candlestick chart data points
        return [
            {
                "time": int(item.timestamp.replace(tzinfo=timezone.utc).timestamp()),
                "open": float(item.open_price),
                "high": float(item.high_price),
                "low": float(item.low_price),
                "close": float(item.close_price),
                "volume": int(item.volume)
            }
            for item in pricing_list
        ]