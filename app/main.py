from fastapi import FastAPI, HTTPException, status, Request, BackgroundTasks
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
import httpx
import uuid
import logging
import os
import time
import json
import redis.asyncio as redis
from graph import app as intelligence_graph  # Your LangGraph state machine
from schemas import IntelligenceResponse, JobAcceptedResponse, JobStatusResponse     # Your zero-trust output boundary
from langchain_core.messages import HumanMessage

app = FastAPI(title="Fintech Data Ingestion firewall")

# Override default 422 Unprocessable Entity to enforce strict corporate API contracts.
# Masks internal Pydantic schema traces from potential bad actors while providing structured debugging.
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

# Zero-trust perimeter schema. Enforces strict type casting and boundary checks 
# before the payload enters the asyncio event loop or downstream storage.
class MarketDataPayload(BaseModel):
    ticker: str = Field(..., description="Equity ticker symbol (e.g., AAPL, TSLA)")
    asset_class: str = Field(..., description="Asset type classification")
    current_price: float = Field(..., gt=0.0, description="Current spot price, must be strictly positive")
    volume: int = Field(..., gt=0, description="24-hour trading volume")

    # Normalize external inputs to prevent SQL injection or routing errors downstream.
    @field_validator("ticker")
    @classmethod
    def validate_ticker_format(cls,value:str) -> str:
        clean_ticker=value.upper().strip()
        if not clean_ticker.isalpha() or not (1<=len(clean_ticker)<=5):
            raise ValueError("Ticker must be 1-5 alphabetic characters only.")
        return clean_ticker
    
    # Restrict downstream processing to supported institutional asset classes.
    @field_validator("asset_class")
    @classmethod
    def validate_class_method(cls,value:str) -> str:
        allowed={"CRYPTO","FOREX","EQUITY","COMMODITY"}
        clean_vlaue=value.upper().strip()
        if clean_vlaue not in allowed:
            raise ValueError(f"Asset class must be one of {allowed}")
        return clean_vlaue

ALPHA_VANTAGE_KEY=os.getenv("ALPHA_VANTAGE_KEY")

async def fetch_live_market_content(payload: MarketDataPayload):
    """
    Delegates outbound network I/O to a non-blocking background thread.
    Prevents external API latency from starving the primary FastAPI event loop.
    """
    url=f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={payload.ticker}&apikey={ALPHA_VANTAGE_KEY}"

    logging.warning(f"[OUTBOUND ASYNC] Reaching out to Alpha Vantage for upstream validation on {payload.ticker}...")

    try:
        # Enforce strict timeouts to prevent hanging sockets if the upstream provider goes down
        async with httpx.AsyncClient(timeout=10.0) as client:
            response=await client.get(url)

            if response.status_code==200:
                market_data=response.json()
                global_quote=market_data.get("Global_Quote",{})

                if global_quote:
                    logging.warning(f"✅ [INTEGRATION SUCCESS] Upstream verification complete for {payload.ticker}. Real-world data verified.")
                    logging.warning(f"📊 Live Data Dump: {global_quote}")
                else:
                    logging.warning(f"⚠️ [API DATA WARN] API responded, but data structure was empty or rate-limited: {market_data}")
            else:
                logging.error(f"❌ [API ERROR] Upstream provider returned non-200 status code: {response.status_code}")

    except httpx.RequestError as exc:
        logging.error(f"❌ [NETWORK FAILURE] Failed to communicate with upstream API tier: {exc}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "firewall": "active", "scope":"fintech"}

@app.post("/v1/market-data/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_market_data(payload: MarketDataPayload, background_tasks: BackgroundTasks):
    """
    Ingestion gateway. Designed for O(1) synchronous execution time. 
    Instantly releases the client connection to maintain high throughput under heavy webhook load.
    """
    background_tasks.add_task(fetch_live_market_content, payload)
    
    return {
        "status": "allowed",
        "message": f"Asset metrics for {payload.ticker} verified. Offloaded to downstream analytics pipeline.",
        "tracking_id": "async_task_dispatched"
    }

# ==============================================================================
# WEEK 4: THE ASYNCHRONOUS POLLING ARCHITECTURE (REDIS QUEUE)
# ==============================================================================

# 1. Initialize the Async Redis Connection Pool
# decode_responses=True ensures Redis returns standard Python strings instead of raw bytes
REDIS_URL = os.getenv("REDIS_URL", "redis://fintech_redis:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# THE ASYNCHRONOUS WORKER
async def run_intelligence_worker(job_id: str, ticker: str):
    """
    Background worker that executes the LangGraph engine.
    Writes the final state to the central Redis cache with a 1-hour expiration.
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
        
        # Execute the heavy AI Graph
        final_state = await intelligence_graph.ainvoke(initial_state)
        report = final_state.get("analysis_report", "ERROR: No report generated.")
        
        # Strict Deterministic Signal Extraction
        report_upper = report.upper()
        if "SIGNAL: BUY" in report_upper: extracted_signal = "BUY"
        elif "SIGNAL: SELL" in report_upper: extracted_signal = "SELL"
        elif "SIGNAL: HOLD" in report_upper: extracted_signal = "HOLD"
        else: extracted_signal = "INVALID"
            
        execution_time = (time.perf_counter() - start_time) * 1000
        
        # Construct the final payload
        payload = {
            "status": "completed",
            "result": {
                "ticker": ticker.upper(),
                "signal": extracted_signal,
                "analysis_report": report,
                "execution_time_ms": round(execution_time, 2)
            }
        }
        
        # Write to Redis with an expiration time (TTL) of 3600 seconds (1 hour)
        await redis_client.set(job_id, json.dumps(payload), ex=3600)
        
    except Exception as e:
        logging.error(f"❌ [WORKER FAILURE] Job {job_id} crashed: {str(e)}")
        error_payload = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }
        await redis_client.set(job_id, json.dumps(error_payload), ex=3600)

# THE HIGH-PERFORMANCE GATEWAY ROUTES
@app.post("/v1/intelligence/jobs/{ticker}", response_model=JobAcceptedResponse, status_code=status.HTTP_202_ACCEPTED, tags=["Intelligence Engine"])
async def submit_analysis_job(ticker: str, background_tasks: BackgroundTasks):
    """
    O(1) execution time. Instantly registers a job in Redis and offloads heavy AI compute.
    """
    job_id = str(uuid.uuid4())
    
    # 1. Initialize job state in Redis IMMEDIATELY so the polling route doesn't 404
    initial_payload = {"status": "processing", "result": None}
    await redis_client.set(job_id, json.dumps(initial_payload), ex=3600)
    
    # 2. Handoff to background worker
    background_tasks.add_task(run_intelligence_worker, job_id, ticker)
    
    return JobAcceptedResponse(job_id=job_id)

@app.get("/v1/intelligence/jobs/{job_id}", response_model=JobStatusResponse, status_code=status.HTTP_200_OK, tags=["Intelligence Engine"])
async def get_job_status(job_id: str):
    """
    Stateless polling endpoint. Queries Redis directly, completely bypassing FastAPI's local memory.
    """
    # 1. Query the central Redis cache
    cached_data = await redis_client.get(job_id)
    
    if not cached_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job ID not found or has expired.")
    
    # 2. Deserialize the JSON string back into a Python dictionary
    job_data = json.loads(cached_data)
    
    if job_data["status"] == "failed":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Intelligence Engine Failed: {job_data.get('error')}")
        
    return JobStatusResponse(
        job_id=job_id,
        status=job_data["status"],
        result=job_data.get("result")
    )