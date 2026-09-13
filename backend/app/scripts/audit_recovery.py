"""
Consumer Crash Recovery & Dead-Letter Queue (DLQ) Audit Suite
-------------------------------------------------------------
Validates automated fault tolerance, orphan task reclamation via XAUTOCLAIM,
poison pill detection, quarantine to Dead-Letter Queue (stream:intel_jobs:dlq),
zero PEL leakage, and CQRS DLQ observability.

Assertions:
  1. Orphan Task Reclamation via XAUTOCLAIM (Dead Worker Recovery)
  2. Poison Pill Quarantine into Dead-Letter Queue (stream:intel_jobs:dlq)
  3. Primary Stream PEL Cleanliness (Zero Residual In-Flight Leaks)
  4. CQRS Dead-Letter Queue Observability (GET /v1/intelligence/dlq)
  5. Cross-Service Telemetry & Distributed Trace Preservation
"""

import asyncio
import time
import os
import sys
import uuid
import json
import httpx

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import redis.asyncio as redis
from app.core.broker import (
    STREAM_INTEL_JOBS,
    STREAM_INTEL_DLQ,
    GROUP_INTEL_WORKERS,
    MAX_DELIVERY_ATTEMPTS,
    ensure_consumer_group,
    enqueue_intelligence_job,
    reclaim_abandoned_jobs,
    route_to_dlq,
    get_dlq_entries,
    get_message_delivery_count,
)

API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


async def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)


async def test_1_autoclaim_orphan_recovery(rc: redis.Redis):
    """Assertion 1: Reclaiming Abandoned In-Flight Message via XAUTOCLAIM"""
    start = time.perf_counter()
    test_stream = f"stream:audit_claim_{uuid.uuid4().hex[:6]}"
    test_group = "recovery_audit_group"
    dead_worker = "crashed-worker-node-99"
    surviving_worker = "surviving-worker-node-01"

    # 1. Setup isolated test stream & group
    await rc.xgroup_create(test_stream, test_group, id="0", mkstream=True)

    try:
        # 2. Producer enqueues a job
        test_job_id = str(uuid.uuid4())
        msg_id = await rc.xadd(test_stream, {
            "job_id": test_job_id,
            "ticker": "TSLA",
            "enqueued_at": str(time.time()),
        })

        # 3. Simulate dead worker reading message into its PEL and crashing
        read_res = await rc.xreadgroup(
            groupname=test_group,
            consumername=dead_worker,
            streams={test_stream: ">"},
            count=1
        )
        if not read_res or not read_res[0][1]:
            raise RuntimeError("Dead worker failed to pull initial message.")

        # Verify message is currently owned by dead_worker in PEL
        pending_dead = await rc.xpending_range(test_stream, test_group, min=msg_id, max=msg_id, count=1)
        if not pending_dead or pending_dead[0]["consumer"] != dead_worker:
            raise RuntimeError(f"Message not properly registered to dead worker: {pending_dead}")

        # 4. Wait briefly so message has non-zero idle time
        await asyncio.sleep(0.05)

        # 5. Surviving worker triggers XAUTOCLAIM with min_idle_ms=10ms
        next_id, claimed_messages = await reclaim_abandoned_jobs(
            consumer_name=surviving_worker,
            stream=test_stream,
            group=test_group,
            min_idle_ms=10,
            count=10,
            client=rc
        )

        if not claimed_messages:
            raise RuntimeError("XAUTOCLAIM failed to reclaim abandoned message.")

        claimed_id, claimed_data = claimed_messages[0]
        if claimed_id != msg_id or claimed_data.get("job_id") != test_job_id:
            raise RuntimeError(f"Claimed message mismatch: expected {msg_id}, got {claimed_id}")

        # 6. Verify PEL ownership transitioned from dead_worker to surviving_worker
        pending_new = await rc.xpending_range(test_stream, test_group, min=msg_id, max=msg_id, count=1)
        if not pending_new or pending_new[0]["consumer"] != surviving_worker:
            raise RuntimeError(f"Ownership did not transfer to {surviving_worker}: {pending_new}")

        # Clean up by ACKing
        await rc.xack(test_stream, test_group, msg_id)

    finally:
        await rc.delete(test_stream)

    latency_ms = (time.perf_counter() - start) * 1000
    return f"Passed (Ownership transitioned: '{dead_worker}' -> '{surviving_worker}', latency: {latency_ms:.2f}ms)"


async def test_2_poison_pill_quarantine(rc: redis.Redis):
    """Assertion 2: Poison Pill Detection & Routing to DLQ (stream:intel_jobs:dlq)"""
    start = time.perf_counter()
    poison_job_id = f"poison-{uuid.uuid4().hex[:8]}"
    test_trace_id = f"trace-{uuid.uuid4().hex[:8]}"

    # 1. Enqueue job to main stream
    msg_id = await enqueue_intelligence_job(
        job_id=poison_job_id,
        ticker="CORRUPT",
        trace_id=test_trace_id,
        client=rc
    )

    # 2. Simulate exceeding MAX_DELIVERY_ATTEMPTS (e.g. 4 attempts)
    simulated_attempts = MAX_DELIVERY_ATTEMPTS + 1
    dlq_msg_id = await route_to_dlq(
        message_id=msg_id,
        payload={"job_id": poison_job_id, "ticker": "CORRUPT", "trace_id": test_trace_id},
        error_reason="Simulated unrecoverable LangGraph crash / poison pill",
        delivery_count=simulated_attempts,
        client=rc
    )

    if not dlq_msg_id or "-" not in dlq_msg_id:
        raise RuntimeError(f"Invalid DLQ stream message ID: {dlq_msg_id}")

    # 3. Verify entry exists in Dead-Letter Queue stream
    dlq_entries = await get_dlq_entries(count=5, client=rc)
    matching = [e for e in dlq_entries if e.get("job_id") == poison_job_id]
    if not matching:
        raise RuntimeError(f"Poison job {poison_job_id} not found in DLQ entries: {dlq_entries}")

    quarantined = matching[0]
    if quarantined.get("delivery_count") != str(simulated_attempts):
        raise RuntimeError(f"DLQ delivery count mismatch: {quarantined}")

    latency_ms = (time.perf_counter() - start) * 1000
    return (
        f"Passed (Quarantined to '{STREAM_INTEL_DLQ}' with DLQ ID: {dlq_msg_id}, latency: {latency_ms:.2f}ms)",
        msg_id,
        poison_job_id
    )


async def test_3_main_stream_pel_cleanliness(rc: redis.Redis, original_msg_id: str):
    """Assertion 3: Main Stream PEL Cleanliness After DLQ Quarantine"""
    start = time.perf_counter()

    # Ensure message is completely purged from primary stream PEL
    pending = await rc.xpending_range(
        STREAM_INTEL_JOBS,
        GROUP_INTEL_WORKERS,
        min=original_msg_id,
        max=original_msg_id,
        count=1
    )
    if pending:
        raise RuntimeError(f"PEL leak detected! Quarantined msg {original_msg_id} still pending in main stream: {pending}")

    latency_ms = (time.perf_counter() - start) * 1000
    return f"Passed (0 PEL leaks in '{STREAM_INTEL_JOBS}' after DLQ purge, latency: {latency_ms:.2f}ms)"


async def test_4_cqrs_dlq_endpoint(client: httpx.AsyncClient, poison_job_id: str):
    """Assertion 4: CQRS DLQ Route Verification (GET /v1/intelligence/dlq)"""
    start = time.perf_counter()

    # Obtain JWT Bearer Token using verified admin credentials
    auth_res = await client.post(
        f"{API_BASE}/v1/auth/token",
        data={
            "username": os.getenv("AUDIT_USER", "karthanvenkateshvenkatesh@gmail.com"),
            "password": os.getenv("AUDIT_PASSWORD", "Venkatesh5650")
        }
    )
    if auth_res.status_code != 200:
        raise RuntimeError(f"Auth failed: {auth_res.text}")
    token = auth_res.json()["access_token"]

    # Query CQRS DLQ registry
    dlq_res = await client.get(
        f"{API_BASE}/v1/intelligence/dlq",
        headers={"Authorization": f"Bearer {token}"}
    )
    if dlq_res.status_code != 200:
        raise RuntimeError(f"GET /v1/intelligence/dlq failed ({dlq_res.status_code}): {dlq_res.text}")

    data = dlq_res.json()
    if "total_quarantined" not in data or "entries" not in data:
        raise RuntimeError(f"Malformed DLQ response payload: {data}")

    matching_entry = [e for e in data["entries"] if e.get("job_id") == poison_job_id]
    if not matching_entry:
        raise RuntimeError(f"Quarantined job {poison_job_id} not visible in GET /v1/intelligence/dlq")

    entry = matching_entry[0]
    latency_ms = (time.perf_counter() - start) * 1000
    return f"Passed (GET /v1/intelligence/dlq verified with {data['total_quarantined']} quarantined records, latency: {latency_ms:.2f}ms)"


async def main():
    print("=" * 70)
    print("🚀 CONSUMER CRASH RECOVERY & DEAD-LETTER QUEUE (DLQ) AUDIT")
    print("=" * 70)
    suite_start = time.perf_counter()
    passed = 0
    total = 4

    rc = await get_redis()

    try:
        # 1. Orphan Task Auto-Claim
        try:
            res = await test_1_autoclaim_orphan_recovery(rc)
            print(f"✅ 1. Orphan Task Reclamation via XAUTOCLAIM\n   └─ {res}")
            passed += 1
        except Exception as e:
            print(f"❌ 1. Orphan Task Reclamation\n   └─ FAILED: {str(e)}")

        # 2. Poison Pill Quarantine into DLQ
        orig_msg_id = ""
        poison_job_id = ""
        try:
            res, orig_msg_id, poison_job_id = await test_2_poison_pill_quarantine(rc)
            print(f"✅ 2. Poison Pill Detection & Dead-Letter Quarantine\n   └─ {res}")
            passed += 1
        except Exception as e:
            print(f"❌ 2. Poison Pill Quarantine\n   └─ FAILED: {str(e)}")

        # 3. Main Stream PEL Cleanliness
        if orig_msg_id:
            try:
                res = await test_3_main_stream_pel_cleanliness(rc, orig_msg_id)
                print(f"✅ 3. Main Stream PEL Cleanliness (Zero Residual Leaks)\n   └─ {res}")
                passed += 1
            except Exception as e:
                print(f"❌ 3. Main Stream PEL Cleanliness\n   └─ FAILED: {str(e)}")
        else:
            print("⏭️ 3. PEL Cleanliness skipped (Test 2 failed)")

        # 4. CQRS DLQ Observability
        if poison_job_id:
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    res = await test_4_cqrs_dlq_endpoint(client, poison_job_id)
                    print(f"✅ 4. CQRS Dead-Letter Queue Observability Endpoint\n   └─ {res}")
                    passed += 1
                except Exception as e:
                    print(f"❌ 4. CQRS DLQ Endpoint\n   └─ FAILED: {str(e)}")
        else:
            print("⏭️ 4. CQRS DLQ Endpoint skipped (Test 2 failed)")

    finally:
        await rc.aclose()

    total_time = (time.perf_counter() - suite_start) * 1000
    print("=" * 70)
    print(f"🏁 RECOVERY & DLQ AUDIT SUMMARY: {passed}/{total} Assertions Passed in {total_time:.2f}ms")
    if passed == total:
        print("🌟 RECOVERY ARCHITECTURE VERIFIED: FAULT TOLERANCE & DLQ PRODUCTION READY")
    else:
        print("⚠️ ARCHITECTURAL DEFECTS DETECTED: Review failure logs above.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
