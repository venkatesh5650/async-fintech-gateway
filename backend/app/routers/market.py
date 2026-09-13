from fastapi import APIRouter, BackgroundTasks, status, Depends
import asyncio
import logging
import yfinance as yf
from datetime import datetime, timezone
from sqlalchemy.future import select
from app.database.database import AsyncSessionLocal
from app.database.models import Ticker, MarketPricing
from app.database.schemas import MarketDataPayload
from app.core.resilience import async_retry
from app.core.limiter import RateLimiter

router = APIRouter(prefix="/v1/market-data", tags=["Market Ingestion"])

#  (Strict limit: 5 requests per minute per IP)
market_firewall = RateLimiter(requests_per_minute=5)


def _fetch_yfinance_data_sync(ticker: str) -> dict:
    """
    Synchronous yfinance call — runs in a thread executor to protect the async event loop.
    Returns the most recent day's OHLCV data from Yahoo Finance (no API key required).
    """
    t = yf.Ticker(ticker.upper())
    # Fetch the last 5 days to ensure we always have at least 1 valid trading day
    hist = t.history(period="5d")

    if hist.empty:
        raise ValueError(f"yfinance returned no data for ticker: {ticker.upper()}")

    # Take the most recent row
    latest = hist.iloc[-1]
    return {
        "open":   round(float(latest["Open"]),   4),
        "high":   round(float(latest["High"]),    4),
        "low":    round(float(latest["Low"]),     4),
        "close":  round(float(latest["Close"]),   4),
        "volume": int(latest["Volume"]),
    }


@async_retry(retries=3, delay=1.0, backoff=2.0)
async def _fetch_live_ohlcv(ticker: str) -> dict:
    """
    Protected async wrapper around the synchronous yfinance call.
    Uses asyncio.to_thread so the event loop is never blocked.
    Exponential backoff via @async_retry decorator.
    """
    return await asyncio.to_thread(_fetch_yfinance_data_sync, ticker)


async def fetch_live_market_content(payload: MarketDataPayload):
    """
    Background worker routine for external verification and relational persistence.
    Fetches real OHLCV data from Yahoo Finance, then persists to PostgreSQL
    and broadcasts via WebSocket.
    """
    ohlcv = None
    try:
        ohlcv = await _fetch_live_ohlcv(payload.ticker)
        logging.info(
            f"📈 [YFINANCE] Fetched live OHLCV for {payload.ticker.upper()}: "
            f"O={ohlcv['open']} H={ohlcv['high']} L={ohlcv['low']} "
            f"C={ohlcv['close']} V={ohlcv['volume']}"
        )
    except Exception as e:
        logging.warning(
            f"⚠️ [YFINANCE FALLBACK] Could not fetch live data for {payload.ticker}: {e}. "
            f"Persisting payload price as OHLC proxy."
        )
        # Graceful fallback — persist the user-provided price if yfinance is unavailable
        ohlcv = {
            "open":   float(payload.current_price),
            "high":   float(payload.current_price),
            "low":    float(payload.current_price),
            "close":  float(payload.current_price),
            "volume": int(payload.volume),
        }

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
                    open_price=ohlcv["open"],
                    high_price=ohlcv["high"],
                    low_price=ohlcv["low"],
                    close_price=ohlcv["close"],
                    volume=ohlcv["volume"],
                )
                session.add(pricing_record)
                await session.flush()

                # Safely copy values to a dictionary within the active transaction
                pricing_data = {
                    "type":      "market_data",
                    "ticker":    payload.ticker.upper(),
                    "timestamp": pricing_record.timestamp.isoformat(),
                    "open":      float(pricing_record.open_price),
                    "high":      float(pricing_record.high_price),
                    "low":       float(pricing_record.low_price),
                    "close":     float(pricing_record.close_price),
                    "volume":    int(pricing_record.volume),
                    "data_source": "Yahoo_Finance_yfinance",
                }

            await session.commit()
            logging.warning(f"✅ [DATABASE SUCCESS] Saved {payload.ticker} OHLCV to database!")

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
    Triggers a background fetch of real OHLCV data from Yahoo Finance (yfinance)
    and persists it to the PostgreSQL time-series database.
    """
    background_tasks.add_task(fetch_live_market_content, payload)
    return {
        "status": "allowed",
        "message": f"Asset metrics for {payload.ticker} queued for downstream analytics.",
        "tracking_id": "async_task_dispatched",
        "data_source": "Yahoo_Finance_yfinance",
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
                "time":   int(item.timestamp.replace(tzinfo=timezone.utc).timestamp()),
                "open":   float(item.open_price),
                "high":   float(item.high_price),
                "low":    float(item.low_price),
                "close":  float(item.close_price),
                "volume": int(item.volume),
            }
            for item in pricing_list
        ]