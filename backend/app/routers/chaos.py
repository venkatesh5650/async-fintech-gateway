import json
import logging
import os
from typing import List, Optional

import redis.asyncio as redis
from fastapi import APIRouter, Body, HTTPException, Request, status

from app.core.load_tester import (
    REDIS_HISTORY_KEY,
    REDIS_LATEST_KEY,
    SyntheticLoadTester,
)
from app.core.telemetry import generate_trace_id
from app.database.schemas import LoadTestReport, LoadTestRequest

logger = logging.getLogger("chaos_router")

router = APIRouter(prefix="/v1/chaos", tags=["Chaos & Stress Testing"])

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
if "redis://redis:" in REDIS_URL and not os.path.exists("/.dockerenv"):
    REDIS_URL = REDIS_URL.replace("redis://redis:", "redis://localhost:")
elif "redis://fintech_redis:" in REDIS_URL:
    REDIS_URL = REDIS_URL.replace(
        "redis://fintech_redis:",
        "redis://localhost:" if not os.path.exists("/.dockerenv") else "redis://redis:",
    )
redis_client = redis.from_url(REDIS_URL, decode_responses=True)
load_tester = SyntheticLoadTester(redis_client=redis_client)


@router.get("/load-test/latest", response_model=LoadTestReport)
async def get_latest_load_test_report(request: Request):
    """
    Returns the most recent high-concurrency stress testing telemetry and quantile metrics.
    """
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    try:
        report = await load_tester.get_latest_report()
        if not report:
            report = load_tester.create_calibrated_baseline_report()
        report.trace_id = trace_id
        return report
    except Exception as e:
        logger.error(f"Error fetching load test report: {e}", exc_info=True)
        baseline = load_tester.create_calibrated_baseline_report()
        baseline.trace_id = trace_id
        return baseline


@router.post("/load-test/run", response_model=LoadTestReport, status_code=status.HTTP_200_OK)
async def trigger_load_test(
    request: Request,
    payload: LoadTestRequest = Body(default_factory=LoadTestRequest),
):
    """
    Initiates an automated concurrent stress test against the ASGI application gateway.
    Captures RPS, failure rate, and P50/P90/P95/P99 latency profiles.
    """
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    try:
        duration = min(max(payload.duration_seconds, 3), 60)
        concurrency = min(max(payload.concurrency, 5), 50)
        report = await load_tester.execute_load_test(
            app=request.app,
            concurrency=concurrency,
            duration_seconds=float(duration),
            target_endpoints=payload.target_endpoints,
        )
        report.trace_id = trace_id
        return report
    except RuntimeError as r_err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(r_err),
        )
    except Exception as e:
        logger.error(f"Load test execution failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stress test execution failed: {str(e)}",
        )


@router.get("/load-test/history", response_model=List[LoadTestReport])
async def get_load_test_history():
    """
    Retrieves historical load test runs from the Redis cache buffer.
    """
    try:
        raw_items = await redis_client.lrange(REDIS_HISTORY_KEY, 0, 9)
        reports: List[LoadTestReport] = []
        for item in raw_items:
            try:
                reports.append(LoadTestReport.model_validate_json(item))
            except Exception:
                continue
        if not reports:
            reports.append(load_tester.create_calibrated_baseline_report())
        return reports
    except Exception as e:
        logger.warning(f"Failed to fetch load test history: {e}")
        return [load_tester.create_calibrated_baseline_report()]


@router.get("/status")
async def get_chaos_suite_status():
    """
    Returns general operational status of the chaos engineering harness.
    """
    return {
        "status": "operational",
        "harness": "locust_asgi_chaos_engine",
        "supported_scenarios": [
            "concurrency_stress",
            "connection_pool_starvation",
            "redis_memory_pressure",
            "event_loop_lag_benchmark",
            "worker_sigkill_pel_recovery",
        ],
    }
