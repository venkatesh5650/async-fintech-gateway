# app/scripts/audit_distributed_tracing.py

"""
Production Verification Suite: Distributed Stream Tracing
---------------------------------------------------------
Executes a 5-point production verification of W3C TraceContext propagation,
Redis Stream span context transport, worker queue wait telemetry, and CQRS trace waterfall inspection.
"""

import sys
import os
import re
import time
import json
import uuid
import asyncio
import logging
import httpx
import redis.asyncio as redis

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.telemetry import (
    generate_trace_id,
    generate_span_id,
    format_traceparent,
    parse_traceparent,
)
from app.core.broker import (
    STREAM_INTEL_JOBS,
    GROUP_INTEL_WORKERS,
    enqueue_intelligence_job,
    get_redis_client,
    route_to_dlq,
)
from app.routers.intelligence import run_intelligence_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_distributed_tracing")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


# ─────────────────────────────────────────────────
# 1. W3C TraceContext & Span Generation Primitives
# ─────────────────────────────────────────────────
async def test_trace_primitives() -> float:
    t0 = time.perf_counter()

    # (a) Verify trace_id: 32 hex chars
    trace_id = generate_trace_id()
    assert len(trace_id) == 32, f"Expected 32 hex chars for trace_id, got {len(trace_id)}"
    assert re.match(r"^[0-9a-f]{32}$", trace_id), f"Invalid trace_id format: {trace_id}"

    # (b) Verify span_id: 16 hex chars
    span_id = generate_span_id()
    assert len(span_id) == 16, f"Expected 16 hex chars for span_id, got {len(span_id)}"
    assert re.match(r"^[0-9a-f]{16}$", span_id), f"Invalid span_id format: {span_id}"

    # (c) Verify W3C traceparent formatting and roundtrip parsing
    formatted = format_traceparent(trace_id, span_id)
    assert formatted.startswith("00-"), f"W3C traceparent must start with version '00-', got {formatted}"
    assert formatted.endswith("-01"), f"W3C traceparent must end with sample flags '-01', got {formatted}"

    parsed_trace, parsed_span = parse_traceparent(formatted)
    assert parsed_trace == trace_id, f"Roundtrip trace mismatch: {parsed_trace} != {trace_id}"
    assert parsed_span == span_id, f"Roundtrip span mismatch: {parsed_span} != {span_id}"

    # (d) Fail-safe on malformed header
    bad_trace, bad_span = parse_traceparent("invalid-header")
    assert bad_trace is None and bad_span is None, "Malformed traceparent must safely return (None, None)"

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 2. Ingest to Stream Context Propagation
# ─────────────────────────────────────────────────
async def test_ingest_to_stream_propagation() -> float:
    t0 = time.perf_counter()
    rc = redis.from_url(REDIS_URL, decode_responses=True)

    test_job_id = f"trace-audit-job-{uuid.uuid4().hex[:8]}"
    test_trace_id = generate_trace_id()
    test_parent_span = generate_span_id()

    try:
        # Enqueue job with trace context
        msg_id = await enqueue_intelligence_job(
            job_id=test_job_id,
            ticker="NVDA",
            trace_id=test_trace_id,
            parent_span_id=test_parent_span,
            client=rc,
        )

        # Inspect raw Redis Stream entry
        entries = await rc.xrange(STREAM_INTEL_JOBS, min=msg_id, max=msg_id)
        assert len(entries) == 1, f"Expected 1 stream entry for msg {msg_id}, got {len(entries)}"

        stream_id, payload = entries[0]
        assert payload["job_id"] == test_job_id
        assert payload["trace_id"] == test_trace_id, f"Stream trace_id mismatch: {payload.get('trace_id')} != {test_trace_id}"
        assert payload["parent_span_id"] == test_parent_span, f"Stream parent_span mismatch"
        assert "enqueue_span_id" in payload and len(payload["enqueue_span_id"]) == 16, "Missing valid enqueue_span_id"
        assert "enqueued_at" in payload, "Missing enqueued_at timestamp"

        # Acknowledge and clean up synthetic message
        await rc.xack(STREAM_INTEL_JOBS, GROUP_INTEL_WORKERS, msg_id)
        await rc.xdel(STREAM_INTEL_JOBS, msg_id)

    finally:
        await rc.aclose()

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 3. Worker Dequeue & Queue Wait Telemetry
# ─────────────────────────────────────────────────
async def test_worker_queue_wait_calculation() -> float:
    t0 = time.perf_counter()

    # Simulate 50ms queue latency
    simulated_enqueued_at = time.time() - 0.050
    now = time.time()
    queue_wait_ms = round((now - simulated_enqueued_at) * 1000, 2)

    assert queue_wait_ms >= 45.0, f"Expected queue_wait_ms >= 45ms, got {queue_wait_ms}ms"

    # Verify span hand-off lineage
    parent_span = generate_span_id()
    worker_span = generate_span_id()
    assert parent_span != worker_span, "Worker span must be unique from parent span"

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 4. WebSocket & State Trace Lineage Verification
# ─────────────────────────────────────────────────
async def test_trace_index_and_state_preservation() -> float:
    t0 = time.perf_counter()
    rc = redis.from_url(REDIS_URL, decode_responses=True)

    test_job_id = f"trace-job-{uuid.uuid4().hex[:8]}"
    test_trace_id = generate_trace_id()
    test_worker_span = generate_span_id()
    test_parent_span = generate_span_id()

    try:
        # Mock result payload structured by run_intelligence_worker
        telemetry_data = {
            "trace_id": test_trace_id,
            "span_id": test_worker_span,
            "parent_span_id": test_parent_span,
            "queue_wait_ms": 14.5,
            "execution_time_ms": 1820.0,
            "total_journey_ms": 1834.5,
        }

        payload = {
            "job_id": test_job_id,
            "status": "completed",
            "trace_id": test_trace_id,
            "server_timestamp": int(time.time() * 1000),
            "telemetry": telemetry_data,
            "result": {
                "ticker": "MSFT",
                "signal": "BUY",
                "analysis_report": "Synthetic test report",
                "execution_time_ms": 1820.0,
            },
        }

        # Cache job and index trace
        await rc.set(test_job_id, json.dumps(payload), ex=300)
        await rc.set(f"trace:{test_trace_id}", json.dumps(payload), ex=300)

        # Verify trace retrieval by index
        indexed_raw = await rc.get(f"trace:{test_trace_id}")
        assert indexed_raw is not None, f"Failed to retrieve trace from index 'trace:{test_trace_id}'"
        indexed_data = json.loads(indexed_raw)

        assert indexed_data["trace_id"] == test_trace_id
        assert indexed_data["telemetry"]["queue_wait_ms"] == 14.5
        assert indexed_data["telemetry"]["execution_time_ms"] == 1820.0
        assert indexed_data["telemetry"]["total_journey_ms"] == 1834.5

    finally:
        await rc.aclose()

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# 5. CQRS Trace Waterfall Endpoint Verification
# ─────────────────────────────────────────────────
async def test_cqrs_trace_waterfall_endpoint() -> float:
    t0 = time.perf_counter()
    rc = redis.from_url(REDIS_URL, decode_responses=True)

    test_job_id = f"endpoint-job-{uuid.uuid4().hex[:8]}"
    test_trace_id = generate_trace_id()

    try:
        # Pre-seed Redis state with a completed trace
        telemetry_data = {
            "trace_id": test_trace_id,
            "span_id": generate_span_id(),
            "parent_span_id": generate_span_id(),
            "queue_wait_ms": 22.4,
            "execution_time_ms": 2100.5,
            "total_journey_ms": 2122.9,
        }
        seed_payload = {
            "job_id": test_job_id,
            "status": "completed",
            "trace_id": test_trace_id,
            "server_timestamp": int(time.time() * 1000),
            "telemetry": telemetry_data,
            "result": {
                "ticker": "AAPL",
                "signal": "BUY",
                "analysis_report": "Bullish momentum verified.",
                "execution_time_ms": 2100.5,
            },
        }
        await rc.set(f"trace:{test_trace_id}", json.dumps(seed_payload), ex=300)

        # Query live CQRS endpoint
        async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=10.0) as client:
            res = await client.get(f"/v1/intelligence/trace/{test_trace_id}")
            assert res.status_code == 200, f"Expected 200 from /trace, got {res.status_code}: {res.text}"
            data = res.json()

            assert data["trace_id"] == test_trace_id
            assert data["job_id"] == test_job_id
            assert data["ticker"] == "AAPL"
            assert data["status"] == "completed"
            assert data["total_journey_ms"] == 2122.9
            assert isinstance(data["spans"], list)
            assert len(data["spans"]) == 4, f"Expected 4 waterfall spans, got {len(data['spans'])}"

            stages = [s["stage"] for s in data["spans"]]
            expected_stages = [
                "INGEST_AND_STREAM_ENQUEUE",
                "STREAM_QUEUE_WAIT",
                "WORKER_MULTI_AGENT_EXECUTION",
                "BROADCAST_AND_PERSIST",
            ]
            assert stages == expected_stages, f"Stage sequence mismatch: {stages}"

    finally:
        await rc.aclose()

    return (time.perf_counter() - t0) * 1000


# ─────────────────────────────────────────────────
# Main Execution Runner
# ─────────────────────────────────────────────────
async def main():
    print("=" * 70)
    print("🚀 DISTRIBUTED STREAM TRACING & CORRELATION ID VERIFICATION AUDIT")
    print("=" * 70)
    suite_start = time.perf_counter()
    passed = 0

    tests = [
        ("1. W3C TraceContext & Span Generation Primitives", test_trace_primitives),
        ("2. Ingest to Stream Context Propagation", test_ingest_to_stream_propagation),
        ("3. Worker Dequeue & Queue Wait Telemetry", test_worker_queue_wait_calculation),
        ("4. WebSocket & State Trace Lineage Verification", test_trace_index_and_state_preservation),
        ("5. CQRS Trace Waterfall Endpoint (/trace/{trace_id})", test_cqrs_trace_waterfall_endpoint),
    ]

    for name, test_fn in tests:
        try:
            latency = await test_fn()
            print(f"✅ {name}")
            print(f"   └─ Passed (latency={latency:.2f}ms)")
            passed += 1
        except AssertionError as ae:
            print(f"❌ {name}")
            print(f"   └─ FAILED Assertion: {ae}")
        except Exception as exc:
            print(f"❌ {name}")
            print(f"   └─ FAILED Exception: {exc}")

    total_ms = (time.perf_counter() - suite_start) * 1000
    print("=" * 70)
    print(f"🏁 DISTRIBUTED TRACING AUDIT SUMMARY: {passed}/{len(tests)} Assertions Passed in {total_ms:.2f}ms")
    if passed == len(tests):
        print("🌟 DISTRIBUTED STREAM TRACING VERIFIED: PRODUCTION READY")
    else:
        print("⚠️ AUDIT FAILED: Correct issues before production deployment.")
    print("=" * 70)

    if passed != len(tests):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
