from fastapi import APIRouter, BackgroundTasks, status, Depends
import asyncio
import math
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
    hist = t.history(period="5d").dropna(subset=["Close"])

    if hist.empty:
        raise ValueError(f"yfinance returned no data for ticker: {ticker.upper()}")

    # Take the most recent row with valid data
    latest = hist.iloc[-1]
    close_p = float(latest["Close"])
    open_p = float(latest["Open"]) if not math.isnan(float(latest["Open"])) else close_p
    high_p = float(latest["High"]) if not math.isnan(float(latest["High"])) else close_p
    low_p = float(latest["Low"]) if not math.isnan(float(latest["Low"])) else close_p
    vol = int(latest["Volume"]) if not math.isnan(float(latest["Volume"])) else 0

    return {
        "open": round(open_p, 4),
        "high": round(high_p, 4),
        "low": round(low_p, 4),
        "close": round(close_p, 4),
        "volume": vol,
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
            "open": float(payload.current_price),
            "high": float(payload.current_price),
            "low": float(payload.current_price),
            "close": float(payload.current_price),
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
                        symbol=payload.ticker.upper(), company_name=f"{payload.ticker.upper()} Corp", is_active=True
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
                    "type": "market_data",
                    "ticker": payload.ticker.upper(),
                    "timestamp": pricing_record.timestamp.isoformat(),
                    "open": float(pricing_record.open_price),
                    "high": float(pricing_record.high_price),
                    "low": float(pricing_record.low_price),
                    "close": float(pricing_record.close_price),
                    "volume": int(pricing_record.volume),
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


@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(market_firewall)])
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


def _fetch_yfinance_history_sync(ticker: str, interval: str = "5m") -> list:
    """
    Synchronous yfinance historical candle fetcher.
    Supports intervals: 5m, 15m, 1h, 4h, 1d.
    """
    is_4h = interval.lower() == "4h"
    tf_map = {
        "5m": ("5d", "5m"),
        "15m": ("5d", "15m"),
        "1h": ("1mo", "1h"),
        "4h": ("3mo", "1h"),  # Fetch 1h candles to aggregate into 4h
        "1d": ("6mo", "1d"),
    }
    period, inv = tf_map.get(interval.lower(), ("5d", "5m"))
    t = yf.Ticker(ticker.upper())
    hist = t.history(period=period, interval=inv).dropna(subset=["Close"])

    raw_records = []
    for idx, row in hist.iterrows():
        ts = int(idx.timestamp())
        close_p = float(row["Close"])
        open_p = float(row["Open"]) if not math.isnan(float(row["Open"])) else close_p
        high_p = float(row["High"]) if not math.isnan(float(row["High"])) else close_p
        low_p = float(row["Low"]) if not math.isnan(float(row["Low"])) else close_p
        vol = int(row["Volume"]) if not math.isnan(float(row["Volume"])) else 0
        raw_records.append(
            {
                "time": ts,
                "open": round(open_p, 4),
                "high": round(high_p, 4),
                "low": round(low_p, 4),
                "close": round(close_p, 4),
                "volume": vol,
            }
        )

    if not is_4h or not raw_records:
        return raw_records

    # Aggregate 1h candles into 4h buckets (4 x 1h bars)
    aggregated = []
    chunk_size = 4
    for i in range(0, len(raw_records), chunk_size):
        chunk = raw_records[i : i + chunk_size]
        if not chunk:
            continue
        agg_open = chunk[0]["open"]
        agg_close = chunk[-1]["close"]
        agg_high = max(c["high"] for c in chunk)
        agg_low = min(c["low"] for c in chunk)
        agg_vol = sum(c["volume"] for c in chunk)
        agg_time = chunk[0]["time"]
        aggregated.append(
            {
                "time": agg_time,
                "open": agg_open,
                "high": agg_high,
                "low": agg_low,
                "close": agg_close,
                "volume": agg_vol,
            }
        )
    return aggregated


@router.get("/history/{ticker}", status_code=status.HTTP_200_OK)
async def get_market_history(
    ticker: str,
    interval: str = "5m",
):
    """
    CQRS Query Edge: Retrieve public time-series historical pricing data for a ticker symbol.
    Fetches real OHLCV timeframe candles from Yahoo Finance (5m, 15m, 1h, 4h, 1d)
    and merges with local database records.
    """
    try:
        yf_records = await asyncio.to_thread(_fetch_yfinance_history_sync, ticker, interval)
    except Exception as e:
        logging.warning(f"⚠️ [YFINANCE HISTORY WARN] Could not fetch {interval} history for {ticker}: {e}")
        yf_records = []

    db_records = []
    try:
        async with AsyncSessionLocal() as session:
            ticker_stmt = select(Ticker).where(Ticker.symbol == ticker.upper())
            ticker_result = await session.execute(ticker_stmt)
            ticker_obj = ticker_result.scalars().first()

            if ticker_obj:
                pricing_stmt = (
                    select(MarketPricing)
                    .where(MarketPricing.ticker_id == ticker_obj.id)
                    .order_by(MarketPricing.timestamp.asc())
                )
                pricing_result = await session.execute(pricing_stmt)
                pricing_list = pricing_result.scalars().all()
                raw_db_records = [
                    {
                        "time": int(item.timestamp.replace(tzinfo=timezone.utc).timestamp()),
                        "open": float(item.open_price),
                        "high": float(item.high_price),
                        "low": float(item.low_price),
                        "close": float(item.close_price),
                        "volume": int(item.volume),
                    }
                    for item in pricing_list
                    if not math.isnan(float(item.close_price)) and float(item.close_price) > 5.0
                ]

                # Group DB records into the active timeframe interval buckets
                tf_sec_map = {
                    "5m": 300,
                    "15m": 900,
                    "1h": 3600,
                    "4h": 14400,
                    "1d": 86400,
                }
                step_sec = tf_sec_map.get(interval.lower(), 300)

                buckets = {}
                for r in raw_db_records:
                    b_time = r["time"] - (r["time"] % step_sec)
                    if b_time not in buckets:
                        buckets[b_time] = []
                    buckets[b_time].append(r)

                for b_time, items in buckets.items():
                    db_records.append(
                        {
                            "time": b_time,
                            "open": items[0]["open"],
                            "high": max(i["high"] for i in items),
                            "low": min(i["low"] for i in items),
                            "close": items[-1]["close"],
                            "volume": max(i["volume"] for i in items),
                        }
                    )
    except Exception as db_err:
        logging.warning(f"⚠️ [DB HISTORY WARN] {db_err}")

    # Merge records cleanly: yf_records provides official historical baseline;
    # DB records provide live telemetry for current active window only.
    if not yf_records:
        merged = sorted(db_records, key=lambda x: x["time"])
        return merged

    by_time = {r["time"]: r for r in yf_records}
    latest_yf_time = yf_records[-1]["time"]

    # Only apply DB live telemetry to update/append the SINGLE active live candle
    if raw_db_records:
        latest_db = raw_db_records[-1]
        live_bucket_time = latest_db["time"] - (latest_db["time"] % step_sec)

        if live_bucket_time >= latest_yf_time:
            # Overwrite or append the single active live candle
            by_time[live_bucket_time] = {
                "time": live_bucket_time,
                "open": latest_db["open"],
                "high": max(latest_db["high"], yf_records[-1]["high"])
                if live_bucket_time == latest_yf_time
                else latest_db["high"],
                "low": min(latest_db["low"], yf_records[-1]["low"])
                if live_bucket_time == latest_yf_time
                else latest_db["low"],
                "close": latest_db["close"],
                "volume": latest_db["volume"],
            }

    merged = sorted(by_time.values(), key=lambda x: x["time"])
    return merged
