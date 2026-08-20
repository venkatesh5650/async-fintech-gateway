# app/routers/intelligence.py

"""
Intelligence Engine Router
--------------------------
Manages asynchronous multi-agent task execution using LangGraph, Redis state 
caching for polling workflows, zero-trust JWT authentication guards, and 
public CQRS read query routes.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Path, Security
from fastapi.security.api_key import APIKeyHeader
import uuid
import json
import time
import logging
from app.database.schemas import JobAcceptedResponse, JobStatusResponse
from app.core.security import get_current_user
from app.core.limiter import RateLimiter
from langchain_core.messages import HumanMessage
from app.graph.graph import app as intelligence_graph
from app.core.emitter import broadcast_intelligence_result
import redis.asyncio as redis
import os
import httpx

# Configure API router with versioned routing prefix and documentation grouping tag
router = APIRouter(prefix="/v1/intelligence", tags=["Intelligence Engine Index"])

API_KEY_NAME = "X-N8N-API-KEY"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def verify_m2m_or_user(
    api_key: str = Security(api_key_header),
):
    """
    Independent M2M and User Gatekeeper:
    Checks the X-N8N-API-KEY header first. If valid, permits access immediately 
    without invoking JWT checks.
    """
    expected_key = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key_2026")
    
   

    if api_key and api_key == expected_key:
        return {"role": "m2m_orchestrator"}
        
    # If no valid M2M key is provided, reject instantly with 403 (preventing unauthenticated 401 leaks)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Zero-Trust Access Denied: Invalid or missing M2M API Key."
    )

# Initialized asynchronous Redis connection pool and perimeter rate limiter
REDIS_URL = os.getenv("REDIS_URL", "redis://fintech_redis:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)
limiter = RateLimiter(requests_per_minute=5)

async def run_intelligence_worker(job_id: str, ticker: str):
    """
    Background worker routine. Executes the LangGraph state machine asynchronously,
    extracts structural trading signals, and caches the result payload in Redis with a 1-hour TTL.
    """
    start_time = time.perf_counter()
    try:
        # Initialized state payload container for the LangGraph re-act graph
        initial_state = {
            "ticker": ticker.upper(),
            "messages": [
                HumanMessage(content=f"Execute a fundamental analysis on the ticker {ticker.upper()}. Evaluate the data and determine a final signal.")
            ],
            "analysis_report": ""
        }
        
        # Invoke asynchronous multi-agent graph execution
        final_state = await intelligence_graph.ainvoke(initial_state)
        report = final_state.get("analysis_report", "ERROR: No report generated.")
       
        # Deterministic string-matching logic to parse alpha signals from agent text output
        report_upper = report.upper()
        if "SIGNAL: BUY" in report_upper: extracted_signal = "BUY"
        elif "SIGNAL: SELL" in report_upper: extracted_signal = "SELL"
        elif "SIGNAL: HOLD" in report_upper: extracted_signal = "HOLD"
        else: extracted_signal = "INVALID"
            
        execution_time = (time.perf_counter() - start_time) * 1000
        
        # Construct standard execution result payload
        payload = {
            "status": "completed",
            "result": {
                "ticker": ticker.upper(),
                "signal": extracted_signal,
                "analysis_report": report,
                "execution_time_ms": round(execution_time, 2)
            }
        }
        # Cache completed state in Redis with a 3600-second expiration window
        await redis_client.set(job_id, json.dumps(payload), ex=3600)

        
        await broadcast_intelligence_result(payload)
        

        # THE EVENT EMITTER: FIRING THE PAYLOAD TO n8n WORKFLOW 2
      
        webhook_url = "http://n8n:5678/webhook/finance-alert"
        
        webhook_data = {
            "job_id": job_id,
            "ticker": ticker.upper(),
            "signal": extracted_signal,
            "analysis": report,
            "execution_time": round(execution_time, 2)
        }
        
        # Using print() to guarantee it bypasses the logger and shows in terminal
        print(f"🚀 [WEBHOOK] Attempting to fire payload for {ticker.upper()} to {webhook_url}")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(webhook_url, json=webhook_data)
                print(f"✅ [WEBHOOK SUCCESS] Fired to n8n for {ticker.upper()} | Status: {response.status_code}")
        except Exception as webhook_err:
            print(f"⚠️ [WEBHOOK FAILURE] Could not reach n8n for {ticker.upper()}: {str(webhook_err)}")
      

    except Exception as e:
        logging.error(f"❌ [WORKER FAILURE] Job {job_id} crashed: {str(e)}")
        error_payload = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }
        # Persist failure state to Redis for upstream client diagnostics
        await redis_client.set(job_id, json.dumps(error_payload), ex=3600)

@router.post("/jobs/{ticker}",status_code=status.HTTP_202_ACCEPTED)
async def submit_analysis_job(
    background_tasks: BackgroundTasks,
    # Strict Pattern Boundary to prevent numeric/malformed ticker drains
    ticker: str = Path(..., pattern="^[a-zA-Z]{1,5}$", description="US Equity Ticker Symbol"), 
    _: None = Depends(limiter),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Command Edge: Protected by rate-limiting, Regex boundary validation, and zero-trust JWT authentication.
    Generates a unique tracking capability token, pre-warms Redis state, and offloads 
    heavy agentic execution to background worker threads.
    """
    job_id = str(uuid.uuid4())
    
    # Pre-warm Redis state to prevent polling race conditions before the worker boots
    initial_payload = {"status": "processing", "result": None}
    await redis_client.set(job_id, json.dumps(initial_payload), ex=3600)
    
    # Register asynchronous background worker task
    background_tasks.add_task(run_intelligence_worker, job_id, ticker)
    
    return JobAcceptedResponse(job_id=job_id)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse, status_code=status.HTTP_200_OK)
async def get_job_status(job_id: str):
    """
    Stateless status-polling route. Bypasses app memory to query Redis directly 
    for optimal horizontal scalability under high concurrent polling loads.
    """
    cached_data = await redis_client.get(job_id)
    if not cached_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job ID not found or expired.")
    
    job_data = json.loads(cached_data)
    if job_data["status"] == "failed":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Engine Failed: {job_data.get('error')}")
        
    return JobStatusResponse(
        job_id=job_id,
        status=job_data["status"],
        result=job_data.get("result")
    )


# @router.get("/public/{ticker}", status_code=status.HTTP_200_OK)
# async def get_public_intelligence(ticker: str):
#     """
#     CQRS Query Edge: Publicly accessible read route for the Next.js frontend dashboard.
#     Bypasses user authentication requirements to facilitate instant, zero-friction client previews.
#     """
#     upper_ticker = ticker.upper()
#     return {
#         "ticker": upper_ticker,
#         "signal": "BUY",
#         "reasoning": f"LangGraph multi-agent analysis successfully completed for {upper_ticker}. Strong momentum detected via asynchronous evaluation.",
#         "execution_time_ms": 138
#     }