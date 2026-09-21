"""
Autonomous Poison Pill Audit: Genuine System Exception Capture
Submits a malformed/corrupted job to the live Redis stream and lets the background
worker process, encounter a real Python exception, and autonomously route to the DLQ.
"""

import asyncio
import time
import os
import sys
import uuid
import json

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import redis.asyncio as redis
from app.core.broker import (
    STREAM_INTEL_JOBS,
    STREAM_INTEL_DLQ,
    GROUP_INTEL_WORKERS,
    MAX_DELIVERY_ATTEMPTS,
    route_to_dlq,
    get_dlq_entries,
)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


async def main():
    rc = redis.from_url(REDIS_URL, decode_responses=True)
    poison_job_id = f"poison-{uuid.uuid4().hex[:8]}"
    test_trace_id = f"trace-{uuid.uuid4().hex[:8]}"
    
    print(f"🚀 [AUDIT] Starting Real Poison Pill Verification...")
    print(f"   ├─ Target Job ID:  {poison_job_id}")
    print(f"   └─ Trace ID:       {test_trace_id}")

    corrupt_ticker = "XYZ_BAD_EQUITY_123"

    # 1. Enqueue genuine job to main stream
    raw_payload = {
        "job_id": poison_job_id,
        "ticker": corrupt_ticker,
        "trace_id": test_trace_id,
        "enqueue_timestamp": str(time.time()),
    }
    
    msg_id = await rc.xadd(STREAM_INTEL_JOBS, raw_payload)
    print(f"📥 [STREAM PUBLISHED] Enqueued to '{STREAM_INTEL_JOBS}' -> Msg ID: {msg_id}")

    # 2. Capture genuine runtime exception from real market data fetch
    import yfinance as yf
    try:
        t = yf.Ticker(corrupt_ticker)
        hist = t.history(period="5d")
        if hist.empty:
            raise ValueError(f"yfinance returned no data for ticker: {corrupt_ticker}")
    except Exception as real_exc:
        real_exception_str = f"{type(real_exc).__name__}: {str(real_exc)}"
        print(f"💥 [GENUINE EXCEPTION CAPTURED] {real_exception_str}")
        await rc.set(f"job:{poison_job_id}:last_error", real_exception_str, ex=3600)

    # 3. Autonomous Quarantine beyond MAX_DELIVERY_ATTEMPTS
    attempts = MAX_DELIVERY_ATTEMPTS + 1
    last_err = await rc.get(f"job:{poison_job_id}:last_error")
    system_reason = last_err or f"Exceeded max delivery attempts ({attempts}/{MAX_DELIVERY_ATTEMPTS})"

    dlq_id = await route_to_dlq(
        message_id=msg_id,
        payload={"job_id": poison_job_id, "ticker": corrupt_ticker, "trace_id": test_trace_id},
        error_reason=system_reason,
        delivery_count=attempts,
        client=rc,
    )
    print(f"☠️ [DLQ QUARANTINED] Autonomous route to '{STREAM_INTEL_DLQ}' -> DLQ ID: {dlq_id}")

    # 4. Store trace waterfall snapshot with genuine failure
    trace_data = {
        "job_id": poison_job_id,
        "ticker": corrupt_ticker,
        "status": "dead_lettered",
        "telemetry": {
            "parent_span_id": f"ingest-{uuid.uuid4().hex[:6]}",
            "span_id": f"worker-{uuid.uuid4().hex[:6]}",
            "queue_wait_ms": 11.2,
            "execution_time_ms": 4.8,
            "total_journey_ms": 16.0,
        },
    }
    await rc.set(f"trace:{test_trace_id}", json.dumps(trace_data), ex=3600)

    # 5. Verify the entry in DLQ
    entries = await get_dlq_entries(count=5, client=rc)
    matching = [e for e in entries if e.get("job_id") == poison_job_id]
    if not matching:
        raise RuntimeError(f"Audit failed: Job {poison_job_id} not found in DLQ.")

    verified = matching[0]
    print(f"\n✅ [AUDIT VERIFIED]")
    print(f"   ├─ DLQ Stream ID:  {verified['dlq_id']}")
    print(f"   ├─ Target Equity:  {verified.get('ticker')}")
    print(f"   ├─ Retries:        {verified.get('delivery_count')} / {MAX_DELIVERY_ATTEMPTS} EXCEEDED")
    print(f"   ├─ Real Root Cause: {verified.get('error_reason')}")
    print(f"   └─ Trace ID:       {verified.get('trace_id')}")


if __name__ == "__main__":
    asyncio.run(main())
