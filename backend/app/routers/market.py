from fastapi import APIRouter, BackgroundTasks, status, Depends
import asyncio
import math
import logging
import time
import threading
import yfinance as yf
from datetime import datetime, timezone
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
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

    if hist.empty and "." not in ticker:
        # Smart international fallback (e.g. TCS -> TCS.NS, RELIANCE -> RELIANCE.NS)
        t_ns = yf.Ticker(f"{ticker.upper()}.NS")
        hist_ns = t_ns.history(period="5d").dropna(subset=["Close"])
        if not hist_ns.empty:
            hist = hist_ns

    if hist.empty:
        raise ValueError(f"yfinance returned no data for ticker: {ticker.upper()}")

    # Take the most recent row with valid data
    latest = hist.iloc[-1]
    candle_ts = int(hist.index[-1].timestamp())
    close_p = float(latest["Close"])
    open_p = float(latest["Open"]) if not math.isnan(float(latest["Open"])) else close_p
    high_p = float(latest["High"]) if not math.isnan(float(latest["High"])) else close_p
    low_p = float(latest["Low"]) if not math.isnan(float(latest["Low"])) else close_p
    vol = int(latest["Volume"]) if not math.isnan(float(latest["Volume"])) else 0

    return {
        "timestamp": candle_ts,
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

                candle_time = (
                    datetime.fromtimestamp(ohlcv["timestamp"], timezone.utc)
                    if "timestamp" in ohlcv
                    else datetime.now(timezone.utc)
                )
                pricing_record = MarketPricing(
                    ticker_id=ticker_obj.id,
                    timestamp=candle_time,
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
                    "interval": "1d",
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


_YF_HISTORY_CACHE: dict[str, tuple[float, list[dict]]] = {}
_YF_CACHE_LOCK = threading.Lock()


def _fetch_yfinance_history_sync(ticker: str, interval: str = "5m") -> list:
    """
    Synchronous yfinance historical candle fetcher with high-speed in-memory TTL caching.
    Prevents Yahoo Finance 429 throttling and enables instant, glitch-free timeframe switching.
    Supports intervals: 5m, 15m, 1h, 4h, 1d.
    """
    cache_key = f"{ticker.upper()}:{interval.lower()}"
    ttl = 120.0 if interval.lower() == "1d" else 30.0
    now = time.time()

    with _YF_CACHE_LOCK:
        if cache_key in _YF_HISTORY_CACHE:
            ts, cached_records = _YF_HISTORY_CACHE[cache_key]
            if now - ts < ttl:
                return cached_records

    is_4h = interval.lower() == "4h"
    tf_map = {
        "5m": ("5d", "5m"),
        "15m": ("5d", "15m"),
        "1h": ("1mo", "1h"),
        "4h": ("3mo", "1h"),  # Fetch 1h candles to aggregate into 4h
        "1d": ("6mo", "1d"),
    }
    period, inv = tf_map.get(interval.lower(), ("5d", "5m"))

    try:
        t = yf.Ticker(ticker.upper())
        hist = t.history(period=period, interval=inv).dropna(subset=["Close"])

        if hist.empty and "." not in ticker:
            # Smart international fallback (e.g. TCS -> TCS.NS, RELIANCE -> RELIANCE.NS)
            t_ns = yf.Ticker(f"{ticker.upper()}.NS")
            hist_ns = t_ns.history(period=period, interval=inv).dropna(subset=["Close"])
            if not hist_ns.empty:
                hist = hist_ns
    except Exception as fetch_err:
        logging.warning(f"⚠️ [YFINANCE FETCH ERR] {ticker} ({interval}): {fetch_err}")
        with _YF_CACHE_LOCK:
            if cache_key in _YF_HISTORY_CACHE:
                return _YF_HISTORY_CACHE[cache_key][1]
        return []

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

    if is_4h and raw_records:
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
        result = aggregated
    else:
        result = raw_records

    if result:
        with _YF_CACHE_LOCK:
            _YF_HISTORY_CACHE[cache_key] = (now, result)
    else:
        with _YF_CACHE_LOCK:
            if cache_key in _YF_HISTORY_CACHE:
                return _YF_HISTORY_CACHE[cache_key][1]

    return result


@router.get("/history/{ticker}", status_code=status.HTTP_200_OK)
async def get_market_history(
    ticker: str,
    interval: str = "5m",
    background_tasks: BackgroundTasks = None,
):
    """
    CQRS Query Edge: Retrieve public time-series historical pricing data for a ticker symbol.
    Fetches real OHLCV timeframe candles from Yahoo Finance (5m, 15m, 1h, 4h, 1d)
    and merges with local database records.
    """
    tf_sec_map = {
        "5m": 300,
        "15m": 900,
        "1h": 3600,
        "4h": 14400,
        "1d": 86400,
    }
    step_sec = tf_sec_map.get(interval.lower(), 300)
    raw_db_records: list[dict] = []
    db_records: list[dict] = []

    try:
        yf_records = await asyncio.to_thread(_fetch_yfinance_history_sync, ticker, interval)
    except Exception as e:
        logging.warning(f"⚠️ [YFINANCE HISTORY WARN] Could not fetch {interval} history for {ticker}: {e}")
        yf_records = []

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

    # Merge records cleanly: yf_records provides official historical baseline (TradingView standard).
    # DB records provide live telemetry for current active window only.
    if not yf_records:
        merged = sorted(db_records, key=lambda x: x["time"])
        return merged

    merged = list(yf_records)

    # Only apply DB live telemetry to update the single active live candle in place.
    # NEVER append phantom future day/intraday candles that duplicate or pollute official history.
    if raw_db_records and step_sec and merged:
        latest_db = raw_db_records[-1]
        live_bucket_time = latest_db["time"] - (latest_db["time"] % step_sec)

        # Update in-place only if timestamps match the current active bar
        if live_bucket_time == merged[-1]["time"]:
            merged[-1]["close"] = latest_db["close"]
            merged[-1]["high"] = max(merged[-1]["high"], latest_db["close"])
            merged[-1]["low"] = min(merged[-1]["low"], latest_db["close"])
            if interval.lower() == "1d" and latest_db["volume"] > 0:
                merged[-1]["volume"] = max(merged[-1]["volume"], latest_db["volume"])

    # Auto-bootstrap DB historical time-series if this ticker is unseeded or has insufficient bars
    if background_tasks is not None and (not ticker_obj or len(raw_db_records) < 15) and yf_records:
        background_tasks.add_task(auto_bootstrap_ticker_pricing, ticker, yf_records)

    return merged


async def auto_bootstrap_ticker_pricing(ticker: str, candles: list):
    """
    Asynchronously backfills historical pricing records for unseeded or newly searched tickers
    into PostgreSQL so that QuantitativeAnalyticsEngine (SQL CTEs) can compute RSI, SMA, and Sharpe ratio.
    """
    if not candles:
        return
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                ticker_stmt = select(Ticker).where(Ticker.symbol == ticker.upper())
                result = await session.execute(ticker_stmt)
                ticker_obj = result.scalars().first()

                if not ticker_obj:
                    ticker_obj = Ticker(
                        symbol=ticker.upper(),
                        company_name=f"{ticker.upper()} Corp",
                        is_active=True,
                    )
                    session.add(ticker_obj)
                    await session.flush()

                for c in candles[-60:]:
                    candle_dt = datetime.fromtimestamp(c["time"], timezone.utc)
                    stmt = pg_insert(MarketPricing).values(
                        ticker_id=ticker_obj.id,
                        timestamp=candle_dt,
                        open_price=c["open"],
                        high_price=c["high"],
                        low_price=c["low"],
                        close_price=c["close"],
                        volume=c["volume"],
                    ).on_conflict_do_nothing(
                        index_elements=["ticker_id", "timestamp"]
                    )
                    await session.execute(stmt)
            await session.commit()
            logging.info(f"✅ [AUTO-BOOTSTRAP] Persisted {len(candles[-60:])} historical bars for {ticker.upper()} into PostgreSQL.")
    except Exception as exc:
        logging.warning(f"⚠️ [AUTO-BOOTSTRAP WARN] Failed to backfill candles for {ticker}: {exc}")


@router.post("/bootstrap/{ticker}", status_code=status.HTTP_200_OK)
async def bootstrap_ticker(ticker: str, background_tasks: BackgroundTasks):
    """
    Explicit on-demand bootstrapping endpoint. Fetches real daily candles
    from Yahoo Finance and seeds PostgreSQL for the requested ticker.
    """
    yf_candles = await asyncio.to_thread(_fetch_yfinance_history_sync, ticker, "1d")
    background_tasks.add_task(auto_bootstrap_ticker_pricing, ticker, yf_candles)
    return {
        "status": "bootstrapping_initiated",
        "ticker": ticker.upper(),
        "candles_found": len(yf_candles),
        "source": "Yahoo_Finance_yfinance",
    }

