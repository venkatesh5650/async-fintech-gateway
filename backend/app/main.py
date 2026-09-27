from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import logging
import time
import random
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text, select, delete
from app.database.database import engine, Base, AsyncSessionLocal
from app.database.models import Ticker, MarketPricing
from app.core.limiter import RateLimiter
from app.core.telemetry import StructuredLoggingMiddleware  
from app.routers import auth, intelligence, market, websocket, analytics

import os
import asyncio
from app.core.broker import ensure_consumer_group, close_redis_client
from app.workers.consumer import StreamConsumerWorker
from app.workers.market_poller import MarketPollerWorker


# ── Inline historical seeder using the app's own engine ────────────────────────
START_PRICES = {
    "AAPL": Decimal("150.00"),
    "MSFT": Decimal("320.00"),
    "GOOGL": Decimal("140.00"),
    "META": Decimal("450.00"),
    "NVDA": Decimal("95.00"),
    "AMD": Decimal("130.00"),
    "TSLA": Decimal("170.00"),
    "JPM": Decimal("160.00"),
    "GS": Decimal("380.00"),
    "MS": Decimal("85.00"),
}

async def _seed_historical_data_inline():
    """Seeds 100 days of OHLCV data using the app's own AsyncSessionLocal."""
    logging.warning("📊 [AUTO-SEED] Starting inline 100-day OHLCV seed for all tickers...")
    days_to_seed = 100
    start_date = datetime.now(timezone.utc) - timedelta(days=days_to_seed)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(delete(MarketPricing))

            for symbol, start_price in START_PRICES.items():
                ticker_stmt = select(Ticker).where(Ticker.symbol == symbol)
                ticker_result = await session.execute(ticker_stmt)
                ticker_obj = ticker_result.scalars().first()

                if not ticker_obj:
                    ticker_obj = Ticker(
                        symbol=symbol,
                        company_name=f"{symbol} Corp",
                        is_active=True,
                    )
                    session.add(ticker_obj)
                    await session.flush()

                current_close = start_price
                for i in range(days_to_seed):
                    candle_date = start_date + timedelta(days=i)
                    candle_ts = candle_date.replace(hour=16, minute=0, second=0, microsecond=0)
                    open_price = current_close
                    fluctuation = Decimal(str(random.uniform(-0.02, 0.03)))
                    close_price = open_price * (Decimal("1.0") + fluctuation)
                    high_price = max(open_price, close_price) * (Decimal("1.0") + Decimal(str(random.uniform(0.001, 0.012))))
                    low_price = min(open_price, close_price) * (Decimal("1.0") - Decimal(str(random.uniform(0.001, 0.012))))
                    volume = random.randint(10_000_000, 75_000_000)
                    current_close = close_price
                    session.add(MarketPricing(
                        ticker_id=ticker_obj.id,
                        timestamp=candle_ts,
                        open_price=round(open_price, 4),
                        high_price=round(high_price, 4),
                        low_price=round(low_price, 4),
                        close_price=round(close_price, 4),
                        volume=volume,
                    ))

    logging.warning("✅ [AUTO-SEED] 100-day historical data seeded for all 10 tickers.")

# Track container boot time for uptime metrics
START_TIME = time.time()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Bootstraps persistent storage engines and Redis Streams consumer groups at boot.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logging.warning("✅ [DATABASE INIT] Verified/Created all PostgreSQL tables in the cloud.")

    # Automatic User Seeding
    try:
        from seed_user import seed_users
        await seed_users()
    except Exception as seed_err:
        logging.warning(f"⚠️ [AUTO-SEED WARNING] User seeding check failed: {seed_err}")

    # Auto Historical Data Seeding: seeds 100 days of OHLC data if DB is empty.
    # Uses the app's own engine/session — no separate connection or SSL issues.
    try:
        async with engine.connect() as check_conn:
            result = await check_conn.execute(text("SELECT COUNT(*) FROM market_pricing"))
            row_count = result.scalar()
        if row_count == 0:
            await _seed_historical_data_inline()
        else:
            logging.warning(f"✅ [AUTO-SEED] market_pricing has {row_count} rows — skipping seed.")
    except Exception as data_seed_err:
        logging.warning(f"⚠️ [AUTO-SEED WARNING] Historical data seeding failed: {data_seed_err}", exc_info=True)


    # Infrastructure Bootstrap: Redis Streams & Consumer Groups
    try:
        await ensure_consumer_group()
    except Exception as e:
        logging.warning(f"⚠️ [BROKER INIT WARNING] Redis Streams group initialization deferred: {e}")

    # Embedded Stream Consumer: ensures jobs are processed seamlessly in single-process mode
    consumer_task = None
    worker = None
    if os.getenv("ENABLE_EMBEDDED_CONSUMER", "true").lower() == "true":
        worker = StreamConsumerWorker(consumer_id="embedded-asgi-worker")
        try:
            await worker.initialize()
            consumer_task = asyncio.create_task(worker.run())
            logging.info("🚀 [EMBEDDED WORKER] Started embedded Redis Stream consumer task.")
        except Exception as e:
            logging.warning(f"⚠️ Could not start embedded stream consumer: {e}")

    # Autonomous Market Data Poller: continuously pulls real yfinance OHLCV data
    poller_task = None
    poller = None
    if os.getenv("ENABLE_MARKET_POLLER", "true").lower() == "true":
        poller = MarketPollerWorker()
        try:
            poller_task = asyncio.create_task(poller.run())
            logging.info("🚀 [MARKET POLLER] Started autonomous market poller daemon.")
        except Exception as e:
            logging.warning(f"⚠️ Could not start market poller: {e}")

    yield

    # Graceful shutdown hooks
    if poller:
        await poller.shutdown()
    if poller_task:
        poller_task.cancel()
    if worker:
        await worker.shutdown()
    if consumer_task:
        consumer_task.cancel()
    await close_redis_client() 

app = FastAPI(title="Fintech Intelligence Gateway", lifespan=lifespan)

# 1. Register Cloud-Native Structured Logging Middleware
app.add_middleware(StructuredLoggingMiddleware)

# 2. Mounting Enterprise Microservice Routers
app.include_router(auth.router)
app.include_router(intelligence.router)
app.include_router(market.router)
app.include_router(websocket.router)
app.include_router(analytics.router)

# Perimeter Defense: Rate Limiter Configuration
limiter = RateLimiter(requests_per_minute=5)

# Intercept default 422 errors to prevent internal Pydantic schema leakage
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"] if loc != "body"),
            "issue": error["msg"],
            "rejected_value": error.get("input")
        })
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST, 
        content={
            "status": "blocked",
            "error_type": "DataFirewallViolation",
            "details": errors
        }
    )

@app.get("/health", tags=["System Telemetry"])
@app.get("/healthz", tags=["System Telemetry"])
async def liveness_probe():
    """
    Cloud Load Balancer Liveness Probe.
    Returns 200 OK if the ASGI event loop and runtime container are operational.
    """
    uptime_seconds = round(time.time() - START_TIME, 2)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "healthy",
            "uptime_seconds": uptime_seconds,
            "firewall": "active",
            "environment": "production"
        }
    )


@app.post("/admin/seed-data", tags=["System Telemetry"])
async def manual_seed_data():
    """
    Admin endpoint: manually triggers 100-day historical OHLCV seed.
    Safe to call multiple times — always wipes and re-seeds.
    """
    try:
        await _seed_historical_data_inline()
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT COUNT(*) FROM market_pricing"))
            count = result.scalar()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "seeded", "rows_inserted": count}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"status": "error", "detail": str(e)}
        )