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
    BatchJobItem,
    JobAuditEntry,
    SystemAuditResponse,
    DeadLetterJobEntry,
    DeadLetterRegistryResponse,
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
from typing import Optional, Any
from app.core.broker import (
    enqueue_intelligence_job,
    enqueue_batch_intelligence_jobs,
    get_dlq_entries,
    STREAM_INTEL_JOBS,
    STREAM_INTEL_DLQ,
)

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
            "job_id": job_id,
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
            logging.warning(f"Webhook notification failed for {ticker.upper()}: {str(webhook_err)}")
      

    except Exception as e:
        logging.error(f"❌ [WORKER FAILURE] Job {job_id} crashed: {str(e)}")
        error_payload = {
            "job_id": job_id,
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
    request: Request,
    # Strict Pattern Boundary to prevent numeric/malformed ticker drains
    ticker: str = Path(..., pattern="^[a-zA-Z]{1,5}$", description="US Equity Ticker Symbol"), 
    _: None = Depends(limiter),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Command Edge: Protected by rate-limiting, Regex boundary validation, and zero-trust JWT authentication.
    Generates a unique tracking capability token, pre-warms Redis state with 'queued',
    and publishes the task event to Redis Streams (stream:intel_jobs) for decoupled worker execution.
    """
    job_id = str(uuid.uuid4())
    trace_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    # Pre-warm Redis state to prevent polling race conditions before consumer pickup
    initial_payload = {
        "job_id": job_id,
        "status": "queued",
        "ticker": ticker.upper(),
        "trace_id": trace_id,
        "result": None,
        "server_timestamp": int(time.time() * 1000)
    }
    await redis_client.set(job_id, json.dumps(initial_payload), ex=3600)
    
    # Publish event to durable Redis Stream
    await enqueue_intelligence_job(
        job_id=job_id,
        ticker=ticker,
        trace_id=trace_id,
        client=redis_client
    )
    
    return JobAcceptedResponse(job_id=job_id)


@router.post("/batch", response_model=BatchJobAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def submit_batch_analysis_jobs(
    request: Request,
    payload: BatchAnalysisRequest = Body(..., description="Batch payload containing 1-50 equity tickers"),
    _: None = Depends(limiter),
    auth_verified: dict = Security(verify_m2m_or_user)
):
    """
    Batch Command Edge:
    Zero-Trust Pydantic perimeter intercepts up to 50 target tickers in a single payload.
    Maps unique tracking UUIDs, pre-warms state in Redis, and enqueues high-throughput
    pipelined stream events to Redis Streams (stream:intel_jobs).
    """
    batch_id = str(uuid.uuid4())
    trace_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID", str(uuid.uuid4()))
    job_items: list[BatchJobItem] = []
    stream_jobs: list[dict[str, Any]] = []

    # Map individual UUIDs and pre-warm Redis states for instant WebSocket subscriptions
    for ticker in payload.tickers:
        job_id = str(uuid.uuid4())
        job_items.append(BatchJobItem(ticker=ticker, job_id=job_id))
        stream_jobs.append({"job_id": job_id, "ticker": ticker})

        # Pre-warm individual job state with 'queued'
        initial_job_payload = {
            "job_id": job_id,
            "status": "queued",
            "batch_id": batch_id,
            "ticker": ticker.upper(),
            "trace_id": trace_id,
            "result": None,
            "server_timestamp": int(time.time() * 1000)
        }
        await redis_client.set(job_id, json.dumps(initial_job_payload), ex=3600)

    # Pre-warm batch status state in Redis
    initial_batch_payload = {
        "batch_id": batch_id,
        "status": "queued",
        "total_assets": len(payload.tickers),
        "jobs": [item.model_dump() for item in job_items],
        "server_timestamp": int(time.time() * 1000)
    }
    await redis_client.set(f"batch:{batch_id}", json.dumps(initial_batch_payload), ex=3600)

    # Pipelined high-throughput publish to Redis Streams
    await enqueue_batch_intelligence_jobs(
        jobs=stream_jobs,
        batch_id=batch_id,
        trace_id=trace_id,
        client=redis_client
    )

    return BatchJobAcceptedResponse(
        batch_id=batch_id,
        total_assets=len(job_items),
        status="queued",
        jobs=job_items,
        message=f"Dispatched {len(job_items)} assets to Redis Streams ('{STREAM_INTEL_JOBS}') for consumer execution."
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


# ==================================================
# LIVE JOB AUDIT REGISTRY
# ==================================================

import re as _re

# UUID v4 pattern used to match only genuine job keys in Redis,
# filtering out batch:*, rate_limit:*, and other namespaced keys.
_UUID_PATTERN = _re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    _re.IGNORECASE,
)


@router.get("/audit", response_model=SystemAuditResponse, status_code=status.HTTP_200_OK)
async def get_live_job_audit():
    """
    Live Job Audit Registry.

    Performs a non-blocking Redis SCAN across active job keys and
    reconstructs runtime state in a single pipeline execution without querying PostgreSQL.
    Public CQRS read endpoint for real-time dashboard telemetry.
    """
    audit_entries: list[JobAuditEntry] = []
    processing_count = completed_count = failed_count = 0

    # --- Redis SCAN: Non-blocking key discovery ---
    # KEYS * is O(N) and blocks the Redis event loop — never use in production.
    # SCAN iterates in small batches and is safe under concurrent load.
    cursor = 0
    job_keys: list[str] = []
    while True:
        cursor, keys = await redis_client.scan(cursor, match="*", count=200)
        # Filter to UUID-shaped keys only — excludes batch:*, rate_limit:*, etc.
        job_keys.extend(k for k in keys if _UUID_PATTERN.match(k))
        if cursor == 0:
            break

    if not job_keys:
        return SystemAuditResponse(
            total_active_jobs=0,
            processing=0,
            completed=0,
            failed=0,
            jobs=[],
            audit_timestamp_ms=int(time.time() * 1000),
        )

    # --- Single-trip Pipeline Fetch ---
    # Fetch all job payloads and their TTLs in two pipelined commands.
    # This is O(1) network round-trips regardless of job count.
    pipeline = redis_client.pipeline()
    for key in job_keys:
        pipeline.get(key)
    for key in job_keys:
        pipeline.ttl(key)
    results = await pipeline.execute()

    # Results layout: first N are GET values, next N are TTL values
    n = len(job_keys)
    raw_values = results[:n]
    ttl_values = results[n:]

    for key, raw, ttl in zip(job_keys, raw_values, ttl_values):
        if not raw:
            continue
        try:
            data = json.loads(raw)
            status_val = data.get("status", "unknown")
            result = data.get("result") or {}

            # Age estimate: jobs are stored with a 3600s TTL.
            # age = 3600 - remaining_ttl gives seconds since dispatch.
            # ttl == -1 means no expiry set (edge case), ttl == -2 means key vanished.
            age_seconds = max(0, 3600 - ttl) if ttl > 0 else 0

            entry = JobAuditEntry(
                job_id=data.get("job_id", key),
                ticker=data.get("ticker") or result.get("ticker", "UNKNOWN"),
                status=status_val,
                batch_id=data.get("batch_id"),
                age_seconds=age_seconds,
                signal=result.get("signal"),
                execution_time_ms=result.get("execution_time_ms"),
            )
            audit_entries.append(entry)

            if status_val == "processing":
                processing_count += 1
            elif status_val == "completed":
                completed_count += 1
            elif status_val == "failed":
                failed_count += 1

        except (json.JSONDecodeError, Exception):
            # Malformed Redis entry — skip silently, do not crash the audit scan
            logging.warning(f"[AUDIT] Skipped malformed Redis key: {key}")
            continue

    # Sort: processing jobs float to top (most urgent for an operator),
    # then sort by age ascending within each status group.
    audit_entries.sort(key=lambda e: (e.status != "processing", e.age_seconds))

    return SystemAuditResponse(
        total_active_jobs=len(audit_entries),
        processing=processing_count,
        completed=completed_count,
        failed=failed_count,
        jobs=audit_entries,
        audit_timestamp_ms=int(time.time() * 1000),
    )


@router.get("/dlq", response_model=DeadLetterRegistryResponse, status_code=status.HTTP_200_OK)
async def get_dead_letter_registry(
    count: int = 50,
    auth_verified: dict = Security(verify_m2m_or_user),
):
    """
    CQRS Observability Route for Dead-Letter Queue (DLQ).
    Returns quarantined jobs that exceeded maximum retry thresholds,
    complete with root-cause diagnostic information and attempt counts.
    """
    raw_entries = await get_dlq_entries(count=count, client=redis_client)
    entries = []
    for item in raw_entries:
        try:
            entries.append(DeadLetterJobEntry(
                dlq_id=item["dlq_id"],
                original_message_id=item.get("original_message_id", ""),
                job_id=item.get("job_id", ""),
                ticker=item.get("ticker", "UNKNOWN"),
                batch_id=item.get("batch_id") or None,
                trace_id=item.get("trace_id") or None,
                delivery_count=int(item.get("delivery_count", 1)),
                error_reason=item.get("error_reason", "Unknown failure"),
                quarantined_at=float(item.get("quarantined_at", time.time())),
            ))
        except Exception as e:
            logging.warning(f"[DLQ AUDIT] Failed to parse DLQ item {item}: {e}")

    return DeadLetterRegistryResponse(
        total_quarantined=len(entries),
        entries=entries,
        audit_timestamp_ms=int(time.time() * 1000),
    )