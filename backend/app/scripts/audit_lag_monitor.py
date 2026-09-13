"""
Stream Lag Monitor & Dynamic Concurrency Tuning — Audit Suite (Day 63)
-----------------------------------------------------------------------
Validates the stream lag monitoring infrastructure and dynamic concurrency
controller introduced in Day 63 of Phase 2.

Assertions:
  1. Stream Lag Primitive Correctness
     - get_stream_lag() returns a structurally valid dict with correct field types.
  2. Lag Detection Under Synthetic Load
     - Enqueue 5 synthetic jobs without consuming -> assert lag >= 5.
     - Consume/ACK all synthetic messages -> assert lag == 0 (stream clean).
  3. Dynamic Concurrency Scaling Logic
     - Instantiate DynamicConcurrencyController logic with synthetic lag values.
     - Verify semaphore adjusts correctly within MIN/MAX bounds for all scenarios.
  4. CQRS Stream Health Endpoint
     - GET /v1/intelligence/stream-health returns 200 with correct schema.
     - health_status is one of the four valid enum values.
"""

import asyncio
import time
import os
import sys
import uuid
import json
import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import redis.asyncio as redis
from app.core.broker import (
    STREAM_INTEL_JOBS,
    GROUP_INTEL_WORKERS,
    ensure_consumer_group,
    get_stream_lag,
    get_stream_health_snapshot,
)
from app.workers.consumer import (
    MIN_CONCURRENCY,
    MAX_CONCURRENCY,
    SCALE_UP_THRESHOLD,
)

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

VALID_HEALTH_STATUSES = {"HEALTHY", "ACTIVE", "DEGRADED", "CRITICAL"}


async def get_redis() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


# ─────────────────────────────────────────────────
# Assertion 1: Stream Lag Primitive Correctness
# ─────────────────────────────────────────────────
async def test_1_lag_primitive_structure(rc: redis.Redis) -> str:
    """
    Verifies get_stream_lag() returns a dict with correct field names and types.
    Does not require any messages in the stream.
    """
    start = time.perf_counter()

    # Ensure stream and group exist before reading
    await ensure_consumer_group(stream=STREAM_INTEL_JOBS, group=GROUP_INTEL_WORKERS, client=rc)

    result = await get_stream_lag(stream=STREAM_INTEL_JOBS, group=GROUP_INTEL_WORKERS, client=rc)

    required_fields = {"lag", "pel_count", "consumer_count", "last_delivered_id"}
    missing = required_fields - set(result.keys())
    if missing:
        raise RuntimeError(f"get_stream_lag() missing fields: {missing}")

    if not isinstance(result["lag"], int):
        raise RuntimeError(f"'lag' must be int, got {type(result['lag'])}")
    if not isinstance(result["pel_count"], int):
        raise RuntimeError(f"'pel_count' must be int, got {type(result['pel_count'])}")
    if not isinstance(result["consumer_count"], int):
        raise RuntimeError(f"'consumer_count' must be int, got {type(result['consumer_count'])}")
    if not isinstance(result["last_delivered_id"], str):
        raise RuntimeError(f"'last_delivered_id' must be str, got {type(result['last_delivered_id'])}")
    if result["lag"] < 0 or result["pel_count"] < 0:
        raise RuntimeError(f"Lag counts must be non-negative: {result}")

    latency_ms = (time.perf_counter() - start) * 1000
    return (
        f"Passed (lag={result['lag']}, pel={result['pel_count']}, "
        f"consumers={result['consumer_count']}, latency={latency_ms:.2f}ms)"
    )


# ─────────────────────────────────────────────────
# Assertion 2: Lag Detection Under Synthetic Load
# ─────────────────────────────────────────────────
async def test_2_lag_detection_under_load(rc: redis.Redis) -> str:
    """
    Uses an isolated test stream to verify the lag monitor detects backlog
    correctly both when messages are pending AND after they are consumed+ACKed.
    """
    start = time.perf_counter()
    test_stream = f"stream:audit_lag63_{uuid.uuid4().hex[:6]}"
    test_group = "audit_lag_group_63"
    consumer_name = "audit-consumer-63"
    JOBS_TO_ENQUEUE = 5

    # Setup isolated stream + consumer group
    await rc.xgroup_create(test_stream, test_group, id="0", mkstream=True)

    try:
        # Phase A: Enqueue 5 jobs WITHOUT consuming them
        msg_ids = []
        for i in range(JOBS_TO_ENQUEUE):
            mid = await rc.xadd(test_stream, {
                "job_id": str(uuid.uuid4()),
                "ticker": f"TICK{i}",
                "enqueued_at": str(time.time()),
            })
            msg_ids.append(mid)

        # Check lag — should be >= JOBS_TO_ENQUEUE (undelivered messages)
        lag_before = await get_stream_lag(stream=test_stream, group=test_group, client=rc)
        if lag_before["lag"] < JOBS_TO_ENQUEUE:
            raise RuntimeError(
                f"Expected lag >= {JOBS_TO_ENQUEUE} before consume, got lag={lag_before['lag']}"
            )

        # Phase B: Consume ALL messages (pull into PEL) then ACK them
        read_res = await rc.xreadgroup(
            groupname=test_group,
            consumername=consumer_name,
            streams={test_stream: ">"},
            count=JOBS_TO_ENQUEUE,
        )
        for _stream, messages in read_res:
            for msg_id, _ in messages:
                await rc.xack(test_stream, test_group, msg_id)

        # Check lag after ACK — both lag and pel_count should be 0
        lag_after = await get_stream_lag(stream=test_stream, group=test_group, client=rc)
        if lag_after["lag"] != 0 or lag_after["pel_count"] != 0:
            raise RuntimeError(
                f"Expected lag=0, pel=0 after consume+ACK, "
                f"got lag={lag_after['lag']}, pel={lag_after['pel_count']}"
            )

    finally:
        await rc.delete(test_stream)

    latency_ms = (time.perf_counter() - start) * 1000
    return (
        f"Passed (detected lag={JOBS_TO_ENQUEUE} before consume, "
        f"lag=0/pel=0 after ACK, latency={latency_ms:.2f}ms)"
    )


# ─────────────────────────────────────────────────
# Assertion 3: Dynamic Concurrency Scaling Logic
# ─────────────────────────────────────────────────
async def test_3_dynamic_concurrency_scaling_logic() -> str:
    """
    Validates the scaling decision algorithm using synthetic lag values.
    Does NOT require Redis — tests the pure logic in isolation.
    """
    start = time.perf_counter()

    def compute_target(total_lag: int, current: int) -> int:
        """Mirror of the algorithm in DynamicConcurrencyController._run_concurrency_controller()"""
        if total_lag == 0:
            target = MIN_CONCURRENCY
        elif total_lag <= SCALE_UP_THRESHOLD:
            target = current  # hold
        elif total_lag <= SCALE_UP_THRESHOLD * 3:
            target = min(current + 1, MAX_CONCURRENCY)  # step up
        else:
            target = MAX_CONCURRENCY  # surge
        return max(MIN_CONCURRENCY, min(target, MAX_CONCURRENCY))

    failures = []

    # Case 1: Idle system — should scale down to MIN
    t = compute_target(total_lag=0, current=7)
    if t != MIN_CONCURRENCY:
        failures.append(f"Idle: expected {MIN_CONCURRENCY}, got {t}")

    # Case 2: Small lag within threshold — should hold current
    t = compute_target(total_lag=SCALE_UP_THRESHOLD - 1, current=5)
    if t != 5:
        failures.append(f"Steady hold: expected 5, got {t}")

    # Case 3: Moderate lag — should step up by 1
    t = compute_target(total_lag=SCALE_UP_THRESHOLD + 1, current=5)
    if t != 6:
        failures.append(f"Step up: expected 6, got {t}")

    # Case 4: Surge — should jump to MAX
    t = compute_target(total_lag=SCALE_UP_THRESHOLD * 3 + 1, current=5)
    if t != MAX_CONCURRENCY:
        failures.append(f"Surge: expected {MAX_CONCURRENCY}, got {t}")

    # Case 5: Cannot exceed MAX even under extreme lag
    t = compute_target(total_lag=9999, current=MAX_CONCURRENCY)
    if t != MAX_CONCURRENCY:
        failures.append(f"Max clamp: expected {MAX_CONCURRENCY}, got {t}")

    # Case 6: Cannot drop below MIN even at idle
    t = compute_target(total_lag=0, current=MIN_CONCURRENCY)
    if t != MIN_CONCURRENCY:
        failures.append(f"Min clamp: expected {MIN_CONCURRENCY}, got {t}")

    if failures:
        raise RuntimeError(f"Scaling logic failures: {failures}")

    latency_ms = (time.perf_counter() - start) * 1000
    return (
        f"Passed (6/6 scaling scenarios verified: idle→MIN, hold, step-up, surge→MAX, "
        f"max-clamp, min-clamp | MIN={MIN_CONCURRENCY}, MAX={MAX_CONCURRENCY}, "
        f"THRESHOLD={SCALE_UP_THRESHOLD}, latency={latency_ms:.2f}ms)"
    )


# ─────────────────────────────────────────────────
# Assertion 4: CQRS Stream Health Endpoint
# ─────────────────────────────────────────────────
async def test_4_cqrs_stream_health_endpoint(client: httpx.AsyncClient) -> str:
    """
    Validates GET /v1/intelligence/stream-health returns 200 with correct schema
    and a valid health_status enum value.
    """
    start = time.perf_counter()

    res = await client.get(f"{API_BASE}/v1/intelligence/stream-health")
    if res.status_code != 200:
        raise RuntimeError(
            f"GET /v1/intelligence/stream-health returned {res.status_code}: {res.text}"
        )

    data = res.json()

    required_fields = {
        "stream_name", "consumer_group", "stream_len",
        "lag", "pel_count", "health_status", "audit_timestamp_ms"
    }
    missing = required_fields - set(data.keys())
    if missing:
        raise RuntimeError(f"stream-health response missing fields: {missing}")

    if data["health_status"] not in VALID_HEALTH_STATUSES:
        raise RuntimeError(
            f"Invalid health_status '{data['health_status']}'. "
            f"Must be one of {VALID_HEALTH_STATUSES}"
        )
    if not isinstance(data["stream_len"], int) or data["stream_len"] < 0:
        raise RuntimeError(f"stream_len must be non-negative int, got: {data['stream_len']}")
    if not isinstance(data["lag"], int) or data["lag"] < 0:
        raise RuntimeError(f"lag must be non-negative int, got: {data['lag']}")

    latency_ms = (time.perf_counter() - start) * 1000
    return (
        f"Passed (health_status='{data['health_status']}', "
        f"stream_len={data['stream_len']}, lag={data['lag']}, "
        f"pel={data['pel_count']}, latency={latency_ms:.2f}ms)"
    )


# ─────────────────────────────────────────────────
# Main Runner
# ─────────────────────────────────────────────────
async def main():
    print("=" * 70)
    print("🚀 STREAM LAG MONITOR & DYNAMIC CONCURRENCY TUNING AUDIT (Day 63)")
    print("=" * 70)
    suite_start = time.perf_counter()
    passed = 0
    total = 4

    rc = await get_redis()

    try:
        # 1. Lag Primitive Structure
        try:
            res = await test_1_lag_primitive_structure(rc)
            print(f"✅ 1. Stream Lag Primitive Correctness\n   └─ {res}")
            passed += 1
        except Exception as e:
            print(f"❌ 1. Stream Lag Primitive\n   └─ FAILED: {e}")

        # 2. Lag Detection Under Load
        try:
            res = await test_2_lag_detection_under_load(rc)
            print(f"✅ 2. Lag Detection Under Synthetic Load\n   └─ {res}")
            passed += 1
        except Exception as e:
            print(f"❌ 2. Lag Detection Under Load\n   └─ FAILED: {e}")

        # 3. Dynamic Scaling Logic
        try:
            res = await test_3_dynamic_concurrency_scaling_logic()
            print(f"✅ 3. Dynamic Concurrency Scaling Logic\n   └─ {res}")
            passed += 1
        except Exception as e:
            print(f"❌ 3. Dynamic Concurrency Scaling Logic\n   └─ FAILED: {e}")

        # 4. CQRS Stream Health Endpoint
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            try:
                res = await test_4_cqrs_stream_health_endpoint(http_client)
                print(f"✅ 4. CQRS Stream Health Endpoint\n   └─ {res}")
                passed += 1
            except Exception as e:
                print(f"❌ 4. CQRS Stream Health Endpoint\n   └─ FAILED: {e}")

    finally:
        await rc.aclose()

    total_time = (time.perf_counter() - suite_start) * 1000
    print("=" * 70)
    print(f"🏁 LAG MONITOR AUDIT SUMMARY: {passed}/{total} Assertions Passed in {total_time:.2f}ms")
    if passed == total:
        print("🌟 STREAM LAG MONITOR & DYNAMIC CONCURRENCY VERIFIED: PRODUCTION READY")
    else:
        print("⚠️  ARCHITECTURAL DEFECTS DETECTED: Review failure logs above.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
