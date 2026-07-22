from fastapi import FastAPI, HTTPException, status, Request, BackgroundTasks
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
import httpx
import uuid
import logging
import os
import time
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
# WEEK 4: THE INTELLIGENCE GATEWAY (LANGGRAPH AI AGENT INTEGRATION)
# ==============================================================================


# ==============================================================================
# WEEK 4: THE ASYNCHRONOUS POLLING ARCHITECTURE (ENTERPRISE QUEUE)
# ==============================================================================

# THE IN-MEMORY JOB STORE (Replaces Redis for Phase 1)
job_store = {}

# THE ASYNCHRONOUS WORKER
async def run_intelligence_worker(job_id: str, ticker: str):
    """
    Background worker that executes the LangGraph engine.
    Updates the global job_store dictionary upon completion or failure.
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
        
        # Heavy compute happens here, disconnected from the client's HTTP request
        final_state = await intelligence_graph.ainvoke(initial_state)
        report = final_state.get("analysis_report", "ERROR: No report generated.")
        
        # Strict Deterministic Signal Extraction
        report_upper = report.upper()
        if "SIGNAL: BUY" in report_upper: extracted_signal = "BUY"
        elif "SIGNAL: SELL" in report_upper: extracted_signal = "SELL"
        elif "SIGNAL: HOLD" in report_upper: extracted_signal = "HOLD"
        else: extracted_signal = "INVALID"
            
        execution_time = (time.perf_counter() - start_time) * 1000
        
        # Write the final strict payload into the state store
        job_store[job_id] = {
            "status": "completed",
            "result": {
                "ticker": ticker.upper(),
                "signal": extracted_signal,
                "analysis_report": report,
                "execution_time_ms": round(execution_time, 2)
            }
        }
        
    except Exception as e:
        logging.error(f"❌ [WORKER FAILURE] Job {job_id} crashed: {str(e)}")
        # Prevent silent failures; log the exact error to the state store
        job_store[job_id] = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }

# THE HIGH-PERFORMANCE GATEWAY ROUTES
@app.post("/v1/intelligence/jobs/{ticker}", response_model=JobAcceptedResponse, status_code=status.HTTP_202_ACCEPTED, tags=["Intelligence Engine"])
async def submit_analysis_job(ticker: str, background_tasks: BackgroundTasks):
    """
    O(1) execution time. Instantly returns a Job ID and offloads heavy AI compute to a background thread.
    """
    job_id = str(uuid.uuid4())
    
    # Initialize job state
    job_store[job_id] = {"status": "processing", "result": None}
    
    # Handoff to background worker
    background_tasks.add_task(run_intelligence_worker, job_id, ticker)
    
    return JobAcceptedResponse(job_id=job_id)

@app.get("/v1/intelligence/jobs/{job_id}", response_model=JobStatusResponse, status_code=status.HTTP_200_OK, tags=["Intelligence Engine"])
async def get_job_status(job_id: str):
    """
    Client polls this endpoint to retrieve the AI payload without blocking connections.
    """
    if job_id not in job_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job ID not found in active store.")
    
    job_data = job_store[job_id]
    
    # If the AI failed, throw a 500 error containing the exact failure reason
    if job_data["status"] == "failed":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Intelligence Engine Failed: {job_data.get('error')}")
        
    return JobStatusResponse(
        job_id=job_id,
        status=job_data["status"],
        result=job_data.get("result")
    )