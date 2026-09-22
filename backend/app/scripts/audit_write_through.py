import sys
import os
import time
import json
import uuid
import logging
import httpx
import redis.asyncio as redis

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.cache import cache_aside_manager
from app.core.telemetry import generate_trace_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_write_through")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
N8N_API_KEY = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key__2026")


async def run_write_through_cache_audit():
    logger.info("==================================================")
    logger.info("AUDIT: Write-Through Cache & Live Prime Indicator")
    logger.info("==================================================")

    client_redis = redis.from_url(REDIS_URL, decode_responses=True)
    test_ticker = "GOOGL"
    cache_key = f"cache:intel:{test_ticker}"
    test_job_id = str(uuid.uuid4())
    test_trace_id = generate_trace_id()

    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=10.0) as http:
        # Pre-clean test keys
        await client_redis.delete(cache_key)
        await client_redis.delete(test_job_id)

        # --------------------------------------------------
        # Assertion 1: Worker Completion Write-Through Priming
        # --------------------------------------------------
        t0 = time.perf_counter()
        completed_job_payload = {
            "job_id": test_job_id,
            "status": "completed",
            "ticker": test_ticker,
            "trace_id": test_trace_id,
            "server_timestamp": int(time.time() * 1000),
            "result": {
                "ticker": test_ticker,
                "signal": "BUY",
                "analysis_report": "Autonomous equity intelligence report for GOOGL.",
                "execution_time_ms": 1420.5,
            },
        }
        await client_redis.set(test_job_id, json.dumps(completed_job_payload), ex=3600)

        # Execute Write-Through Cache Priming as worker does on completion
        cache_entry = {
            "ticker": test_ticker,
            "signal": "BUY",
            "analysis_report": "Autonomous equity intelligence report for GOOGL.",
            "execution_time_ms": 1420.5,
            "job_id": test_job_id,
            "trace_id": test_trace_id,
            "source": "WRITE_THROUGH",
        }
        await cache_aside_manager.set_cached_result(
            ticker=test_ticker,
            data=cache_entry,
            ttl=300,
            source="WRITE_THROUGH",
        )
        latency1 = (time.perf_counter() - t0) * 1000

        raw_cached = await client_redis.get(cache_key)
        assert raw_cached is not None, f"Expected Redis key '{cache_key}' to exist after write-through priming."
        cached_meta = json.loads(raw_cached)
        ttl = await client_redis.ttl(cache_key)

        assert cached_meta.get("source") == "WRITE_THROUGH", f"Expected source='WRITE_THROUGH', got {cached_meta.get('source')}"
        assert "primed_at" in cached_meta, "Expected 'primed_at' timestamp in cached metadata."
        assert 0 < ttl <= 300, f"Expected 0 < TTL <= 300, got {ttl}"
        logger.info(
            f"✅ [ASSERTION 1 PASSED] Write-Through priming verified: key='{cache_key}' "
            f"TTL={ttl}s source={cached_meta.get('source')} in {latency1:.2f}ms"
        )

        # --------------------------------------------------
        # Assertion 2: Pre-Warmed Read Retrieval (Zero DB fallback)
        # --------------------------------------------------
        t1 = time.perf_counter()
        resp2 = await http.get(f"/v1/intelligence/results/{test_ticker}")
        latency2 = (time.perf_counter() - t1) * 1000

        assert resp2.status_code == 200, f"Expected 200 OK, got {resp2.status_code}: {resp2.text}"
        data2 = resp2.json()

        assert data2.get("cache_hit") is True, f"Expected cache_hit=True on pre-warmed read, got {data2.get('cache_hit')}"
        assert data2.get("source") == "CACHE", f"Expected source='CACHE', got {data2.get('source')}"
        assert data2.get("prime_origin") == "WRITE_THROUGH", f"Expected prime_origin='WRITE_THROUGH', got {data2.get('prime_origin')}"
        assert data2.get("signal") == "BUY", f"Expected signal='BUY', got {data2.get('signal')}"
        logger.info(
            f"✅ [ASSERTION 2 PASSED] Pre-warmed CQRS read hit: prime_origin={data2.get('prime_origin')} "
            f"in {latency2:.2f}ms (Cache I/O: {data2.get('data_source_latency_ms')}ms)"
        )

        # --------------------------------------------------
        # Assertion 3: Live Job Audit Telemetry with Primed Cache State
        # --------------------------------------------------
        t2 = time.perf_counter()
        resp3 = await http.get("/v1/intelligence/audit")
        latency3 = (time.perf_counter() - t2) * 1000

        assert resp3.status_code == 200, f"Expected 200 OK, got {resp3.status_code}"
        data3 = resp3.json()
        jobs = data3.get("jobs", [])

        target_job = next((j for j in jobs if j.get("job_id") == test_job_id), None)
        assert target_job is not None, f"Expected job_id '{test_job_id}' in audit jobs list."
        assert target_job.get("cache_primed") is True, f"Expected cache_primed=True, got {target_job.get('cache_primed')}"
        assert target_job.get("primed_at") is not None, "Expected non-null primed_at timestamp."
        assert target_job.get("cache_ttl_remaining") is not None and target_job.get("cache_ttl_remaining") > 0, (
            f"Invalid cache_ttl_remaining: {target_job.get('cache_ttl_remaining')}"
        )
        logger.info(
            f"✅ [ASSERTION 3 PASSED] Job audit telemetry confirmed: ticker={target_job.get('ticker')} "
            f"cache_primed={target_job.get('cache_primed')} TTL={target_job.get('cache_ttl_remaining')}s in {latency3:.2f}ms"
        )

        # --------------------------------------------------
        # Assertion 4: Dynamic Cache State Reflection Upon Invalidation
        # --------------------------------------------------
        inval_resp = await http.post(
            f"/v1/intelligence/cache/invalidate/{test_ticker}",
            headers={"X-N8N-API-KEY": N8N_API_KEY}
        )
        assert inval_resp.status_code == 200, f"Invalidation failed: {inval_resp.text}"

        # Immediately query audit to verify cache_primed reflects evicted state
        resp4 = await http.get("/v1/intelligence/audit")
        assert resp4.status_code == 200
        jobs4 = resp4.json().get("jobs", [])
        target_job_post = next((j for j in jobs4 if j.get("job_id") == test_job_id), None)
        assert target_job_post is not None
        assert target_job_post.get("cache_primed") is False, (
            f"Expected cache_primed=False post-invalidation, got {target_job_post.get('cache_primed')}"
        )
        assert target_job_post.get("cache_ttl_remaining") is None, (
            f"Expected cache_ttl_remaining=None post-invalidation, got {target_job_post.get('cache_ttl_remaining')}"
        )
        logger.info(
            "✅ [ASSERTION 4 PASSED] Dynamic audit reflection verified: cache_primed transitioned to False on eviction."
        )

        # --------------------------------------------------
        # Assertion 5: Zero Regressions on Operational Endpoints
        # --------------------------------------------------
        health_resp = await http.get("/v1/intelligence/stream-health")
        assert health_resp.status_code == 200, f"Stream health failed: {health_resp.status_code}"

        cb_resp = await http.get("/v1/intelligence/circuit-breaker")
        assert cb_resp.status_code == 200, f"Circuit breaker failed: {cb_resp.status_code}"

        dlq_resp = await http.get("/v1/intelligence/dlq", headers={"X-N8N-API-KEY": N8N_API_KEY})
        assert dlq_resp.status_code == 200, f"DLQ endpoint failed: {dlq_resp.status_code}"

        logger.info(
            "✅ [ASSERTION 5 PASSED] Operational Telemetry regression check verified (/stream-health, /circuit-breaker, /dlq all 200 OK)."
        )

        # Cleanup
        await client_redis.delete(test_job_id)

    await client_redis.aclose()
    logger.info("==================================================")
    logger.info("🎉 5/5 WRITE-THROUGH CACHE ASSERTIONS VERIFIED. 100% PASS.")
    logger.info("==================================================")


if __name__ == "__main__":
    import asyncio
    asyncio.run(run_write_through_cache_audit())
