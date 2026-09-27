from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import logging
import time
from contextlib import asynccontextmanager

from app.database.database import engine, Base
from app.core.limiter import RateLimiter
from app.core.telemetry import StructuredLoggingMiddleware  
from app.routers import auth, intelligence, market, websocket, analytics

import os
import asyncio
from app.core.broker import ensure_consumer_group, close_redis_client
from app.workers.consumer import StreamConsumerWorker
from app.workers.market_poller import MarketPollerWorker

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