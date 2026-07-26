from fastapi import FastAPI, HTTPException, status, Request, BackgroundTasks, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
import httpx
import uuid
import logging
import os
import time
import json
import redis.asyncio as redis
from app.graph.graph import app as intelligence_graph
from app.database.schemas import JobAcceptedResponse, JobStatusResponse
from app.database.models import Ticker, MarketPricing
from langchain_core.messages import HumanMessage
from app.core.firewall import RateLimiter
from app.database.database import AsyncSessionLocal
from sqlalchemy.future import select
from datetime import datetime, timezone

from contextlib import asynccontextmanager
from app.database.database import engine, Base
from app.routers import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP LOGIC ---
    """
    Forces the cloud database to create the tables if they do not exist at boot.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logging.warning("✅ [DATABASE INIT] Verified/Created all PostgreSQL tables in the cloud.")
    
    yield # Hands control back to FastAPI to start accepting requests
    

app = FastAPI(title="Fintech Intelligence Gateway", lifespan=lifespan)
app.include_router(auth.router)

# Perimeter Defense: Hard ceiling of 5 RPM per IP to prevent LLM API token exhaustion.
limiter = RateLimiter(requests_per_minute=5)

# Intercept default 422 errors to prevent internal Pydantic schema leakage to unauthenticated clients.
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

# Strict boundary model. Prevents malformed data from reaching the async event loop.
class MarketDataPayload(BaseModel):
    ticker: str = Field(..., description="Equity ticker symbol (e.g., AAPL, TSLA)")
    asset_class: str = Field(..., description="Asset type classification")
    current_price: float = Field(..., gt=0.0, description="Current spot price, must be strictly positive")
    volume: int = Field(..., gt=0, description="24-hour trading volume")

    @field_validator("ticker")
    @classmethod
    def validate_ticker_format(cls, value: str) -> str:
        clean_ticker = value.upper().strip()
        if not clean_ticker.isalpha() or not (1 <= len(clean_ticker) <= 5):
            raise ValueError("Ticker must be 1-5 alphabetic characters only.")
        return clean_ticker
    
    @field_validator("asset_class")
    @classmethod
    def validate_class_method(cls, value: str) -> str:
        allowed = {"CRYPTO", "FOREX", "EQUITY", "COMMODITY"}
        clean_value = value.upper().strip()
        if clean_value not in allowed:
            raise ValueError(f"Asset class must be one of {allowed}")
        return clean_value

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY")



async def fetch_live_market_content(payload: MarketDataPayload):
    
    allowed_test_tickers = ["AAPL", "MSFT", "GOOGL"]
    
    if payload.ticker.upper() in allowed_test_tickers:
        logging.warning(f"🚧 [DEV BYPASS] Skipping Alpha Vantage validation for {payload.ticker}.")
    else:
        # Standard Alpha Vantage check for all other tickers
        url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={payload.ticker}&apikey={ALPHA_VANTAGE_KEY}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.get(url) # We are ignoring the result for now just to keep it running
            
    # ---------------------------------------------------------
    # 2. THE MISSING DATABASE SAVE 
    # ---------------------------------------------------------
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # Check if Ticker exists
                stmt = select(Ticker).where(Ticker.symbol == payload.ticker.upper())
                result = await session.execute(stmt)
                ticker_obj = result.scalars().first()

                # If not, create it
                if not ticker_obj:
                    ticker_obj = Ticker(symbol=payload.ticker.upper(), company_name=f"{payload.ticker.upper()} Corp", is_active=True)
                    session.add(ticker_obj)
                    await session.flush() 

                # Save the actual price data!
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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "firewall": "active", "scope": "fintech"}

@app.post("/v1/market-data/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_market_data(payload: MarketDataPayload, background_tasks: BackgroundTasks):
    """
    O(1) synchronous ingestion. Immediately releases client connection to sustain high webhook throughput.
    """
    background_tasks.add_task(fetch_live_market_content, payload)
    return {
        "status": "allowed",
        "message": f"Asset metrics for {payload.ticker} queued for downstream analytics.",
        "tracking_id": "async_task_dispatched"
    }

# ==============================================================================
# DISTRIBUTED QUEUE & MULTI-AGENT STATE MACHINE
# ==============================================================================

# Internal Docker network connection. decode_responses=True avoids byte-parsing overhead.
REDIS_URL = os.getenv("REDIS_URL", "redis://fintech_redis:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

async def run_intelligence_worker(job_id: str, ticker: str):
    """
    Executes ReAct graph logic. Writes final state to centralized Redis for stateless client polling.
    """
    start_time = time.perf_counter()
    try:
        initial_state = {
            "ticker": ticker.upper(),
            "messages": [
                HumanMessage(content=f"Execute a fundamental analysis on the ticker {ticker.upper()}. Evaluate the data and determine a final signal.")
            ],
            "analysis_report": ""
        }
        
        final_state = await intelligence_graph.ainvoke(initial_state)
        report = final_state.get("analysis_report", "ERROR: No report generated.")
        
        # Enforce deterministic signal extraction from LLM string output
        report_upper = report.upper()
        if "SIGNAL: BUY" in report_upper: extracted_signal = "BUY"
        elif "SIGNAL: SELL" in report_upper: extracted_signal = "SELL"
        elif "SIGNAL: HOLD" in report_upper: extracted_signal = "HOLD"
        else: extracted_signal = "INVALID"
            
        execution_time = (time.perf_counter() - start_time) * 1000
        
        payload = {
            "status": "completed",
            "result": {
                "ticker": ticker.upper(),
                "signal": extracted_signal,
                "analysis_report": report,
                "execution_time_ms": round(execution_time, 2)
            }
        }
        
        # TTL set to 3600s (1 hour) to force automated memory garbage collection
        await redis_client.set(job_id, json.dumps(payload), ex=3600)
        
    except Exception as e:
        logging.error(f"❌ [WORKER FAILURE] Job {job_id} crashed: {str(e)}")
        error_payload = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }
        await redis_client.set(job_id, json.dumps(error_payload), ex=3600)
from fastapi import APIRouter, BackgroundTasks, Depends, status
from app.core.security import get_current_user  # Import your security dependency

@app.post(
    "/v1/intelligence/jobs/{ticker}", 
    response_model=JobAcceptedResponse, 
    status_code=status.HTTP_202_ACCEPTED, 
    tags=["Intelligence Engine"]
)
async def submit_analysis_job(
    ticker: str, 
    background_tasks: BackgroundTasks,
    _: None = Depends(limiter),          # Existing Perimeter Firewall Check
    current_user: dict = Depends(get_current_user)  # New Zero-Trust JWT Security Guard
):
    """
    O(1) job registration. Secured by cryptographic JWT authentication 
    and offloads LangGraph execution to background workers.
    """
    # track which user triggered the job!
    print(f"🔒 Authenticated user {current_user['email']} triggered analysis for {ticker}")

    job_id = str(uuid.uuid4())
    
    # Pre-warm Redis state to prevent 404 race conditions during immediate client polling
    initial_payload = {"status": "processing", "result": None}
    await redis_client.set(job_id, json.dumps(initial_payload), ex=3600)
    
    background_tasks.add_task(run_intelligence_worker, job_id, ticker)
    return JobAcceptedResponse(job_id=job_id)

@app.get("/v1/intelligence/jobs/{job_id}", response_model=JobStatusResponse, status_code=status.HTTP_200_OK, tags=["Intelligence Engine"])
async def get_job_status(job_id: str):
    """
    Stateless horizontal scaling route. Bypasses Python memory and hits Redis directly.
    """
    cached_data = await redis_client.get(job_id)
    
    if not cached_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job ID not found or has expired.")
    
    job_data = json.loads(cached_data)
    
    if job_data["status"] == "failed":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Intelligence Engine Failed: {job_data.get('error')}")
        
    return JobStatusResponse(
        job_id=job_id,
        status=job_data["status"],
        result=job_data.get("result")
    )



