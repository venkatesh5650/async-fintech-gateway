# app/routers/intelligence.py

"""
Intelligence Engine Router
--------------------------
Manages asynchronous multi-agent task execution using LangGraph, Redis state 
caching for polling workflows, zero-trust JWT authentication guards, and 
public CQRS read query routes.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Path, Security, Request, Body
from fastapi.security.api_key import APIKeyHeader
import uuid
import json
import time
import logging
import asyncio
from app.database.schemas import (
    JobAcceptedResponse, 
    JobStatusResponse,
    BatchAnalysisRequest,
    BatchJobAcceptedResponse,
    BatchJobItem
)
from app.core.security import get_current_user
from app.core.limiter import RateLimiter
from app.routers.websocket import manager
from langchain_core.messages import HumanMessage
from app.graph.graph import app as intelligence_graph
from app.core.emitter import broadcast_intelligence_result
import redis.asyncio as redis
import os
import httpx

MAX_CONCURRENCY = int(os.getenv("BATCH_CONCURRENCY_LIMIT", "5"))


# Configure API router with versioned routing prefix and documentation grouping tag
router = APIRouter(prefix="/v1/intelligence", tags=["Intelligence Engine Index"])

API_KEY_NAME = "X-N8N-API-KEY"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def verify_m2m_or_user(
    request: Request,
    api_key: str = Security(api_key_header)
):
    """
    Security gatekeeper validating incoming requests via M2M API key or User JWT.
    """
    expected_key = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key_2026")
    
    # Machine-to-Machine authentication check
    if api_key and api_key == expected_key:
        return {"role": "m2m_orchestrator"}
        
    # User JWT authentication check
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        user = await get_current_user(token) 
        if user:
            return user
        
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Zero-Trust Access Denied: Missing valid M2M API Key or User JWT."
    )

# Asynchronous Redis connection pool and perimeter rate limiter
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
        # Initialize state payload container for the LangGraph state graph
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
       
        # Parse alpha signals deterministically from agent output
        report_upper = report.upper()
        if "SIGNAL: BUY" in report_upper: extracted_signal = "BUY"
        elif "SIGNAL: SELL" in report_upper: extracted_signal = "SELL"
        elif "SIGNAL: HOLD" in report_upper: extracted_signal = "HOLD"
        else: extracted_signal = "INVALID"
            
        execution_time = (time.perf_counter() - start_time) * 1000
        
        # Construct standardized execution result payload
        payload = {
            "status": "completed",
            "server_timestamp": int(time.time() * 1000),
            "result": {
                "ticker": ticker.upper(),
                "signal": extracted_signal,
                "analysis_report": report,
                "execution_time_ms": round(execution_time, 2)
            }
        }
        # Cache completed state in Redis with a 3600-second expiration TTL
        await redis_client.set(job_id, json.dumps(payload), ex=3600)
        
        # Dispatch result to active WebSocket channels and event broadcaster
        await manager.send_personal_message(payload, job_id=job_id)
        await manager.broadcast(payload)
        await broadcast_intelligence_result(payload)
      
        # Dispatch notification payload to external orchestration webhook
        webhook_url = "http://n8n:5678/webhook/finance-alert"
        
        webhook_data = {
            "job_id": job_id,
            "ticker": ticker.upper(),
            "signal": extracted_signal,
            "analysis": report,
            "execution_time": round(execution_time, 2)
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(webhook_url, json=webhook_data)
                logging.info(f"Webhook notification dispatched for {ticker.upper()} (Status: {response.status_code})")
        except Exception as webhook_err:
            logging.warning(f"Webhook notification failed for {ticker.upper()}: {str(webhook_err)}")k_err)}")
      

    except Exception as e:
        logging.error(f"❌ [WORKER FAILURE] Job {job_id} crashed: {str(e)}")
        error_payload = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }
        # Persist failure state to Redis for upstream client diagnostics
        await redis_client.set(job_id, json.dumps(error_payload), ex=3600)
        await manager.send_personal_message(error_payload, job_id=job_id)
        await manager.broadcast(error_payload)


async def run_batch_intelligence_orchestrator(batch_id: str, jobs: list[tuple[str, str]]):
    """
    Concurrency Fan-Out Orchestrator.
    Controls parallel execution of multi-asset intelligence workers using an asyncio.Semaphore
    to prevent thread starvation and external API rate limit penalties.
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def worker_with_semaphore(job_id: str, ticker: str):
        async with semaphore:
            await run_intelligence_worker(job_id, ticker)

    # Launch controlled concurrent fan-out across worker threads
    await asyncio.gather(*(worker_with_semaphore(job_id, ticker) for job_id, ticker in jobs))

    # Mark parent batch status completed in Redis
    completed_payload = {
        "batch_id": batch_id,
        "status": "completed",
        "total_assets": len(jobs),
        "server_timestamp": int(time.time() * 1000)
    }
    await redis_client.set(f"batch:{batch_id}", json.dumps(completed_payload), ex=3600)


@router.post("/jobs/{ticker}", status_code=status.HTTP_202_ACCEPTED)
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


@router.post("/batch", response_model=BatchJobAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def submit_batch_analysis_jobs(
    background_tasks: BackgroundTasks,
    payload: BatchAnalysisRequest = Body(..., description="Batch payload containing 1-50 equity tickers"),
    _: None = Depends(limiter),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Batch Command Edge:
    Zero-Trust Pydantic perimeter intercepts up to 50 target tickers in a single payload.
    Maps unique tracking UUIDs in Redis and offloads execution to an asynchronous
    controlled concurrency worker pool (asyncio.Semaphore).
    """
    batch_id = str(uuid.uuid4())
    job_items: list[BatchJobItem] = []
    worker_jobs: list[tuple[str, str]] = []

    # Map individual UUIDs and pre-warm Redis states for instant WebSocket subscriptions
    for ticker in payload.tickers:
        job_id = str(uuid.uuid4())
        job_items.append(BatchJobItem(ticker=ticker, job_id=job_id))
        worker_jobs.append((job_id, ticker))

        # Pre-warm individual job state
        initial_job_payload = {
            "status": "processing",
            "batch_id": batch_id,
            "ticker": ticker,
            "result": None
        }
        await redis_client.set(job_id, json.dumps(initial_job_payload), ex=3600)

    # Pre-warm batch status state in Redis
    initial_batch_payload = {
        "batch_id": batch_id,
        "status": "processing",
        "total_assets": len(payload.tickers),
        "jobs": [item.model_dump() for item in job_items],
        "server_timestamp": int(time.time() * 1000)
    }
    await redis_client.set(f"batch:{batch_id}", json.dumps(initial_batch_payload), ex=3600)

    # Dispatch asynchronous concurrency fan-out
    background_tasks.add_task(run_batch_intelligence_orchestrator, batch_id, worker_jobs)

    return BatchJobAcceptedResponse(
        batch_id=batch_id,
        total_assets=len(job_items),
        status="queued",
        jobs=job_items,
        message=f"Dispatched {len(job_items)} assets to controlled concurrency intelligence fan-out."
    )


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