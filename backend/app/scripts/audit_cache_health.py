import sys
import os
import time
import json
import asyncio
import logging
import httpx
import redis.asyncio as redis

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_cache_health")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
N8N_API_KEY = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key__2026")


async def run_cache_health_audit():
    logger.info("==================================================")
    logger.info("AUDIT: Cache Health & Telemetry Subsystem")
    logger.info("==================================================")

    client_redis = redis.from_url(REDIS_URL, decode_responses=True)

    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=15.0) as http:
        # --------------------------------------------------
        # Assertion 1: CQRS Cache Health Endpoint Contract
        # --------------------------------------------------
        t0 = time.perf_counter()
        resp = await http.get("/v1/intelligence/cache-health")
        duration_ms = (time.perf_counter() - t0) * 1000

        assert resp.status_code == 200, f"Cache health endpoint returned status {resp.status_code}"
        data = resp.json()

        required_fields = [
            "hit_count",
            "miss_count",
            "total_requests",
            "hit_ratio_pct",
            "contention_count",
            "total_cached_keys",
            "memory_used_mb",
            "memory_peak_mb",
            "server_timestamp_ms",
        ]
        for field in required_fields:
            assert field in data, f"Missing required telemetry metric: '{field}'"

        assert isinstance(data["hit_count"], int) and data["hit_count"] >= 0
        assert isinstance(data["miss_count"], int) and data["miss_count"] >= 0
        assert isinstance(data["total_requests"], int) and data["total_requests"] >= 0
        assert isinstance(data["hit_ratio_pct"], (int, float)) and 0.0 <= data["hit_ratio_pct"] <= 100.0
        assert isinstance(data["memory_used_mb"], (int, float)) and data["memory_used_mb"] > 0.0
        assert isinstance(data["memory_peak_mb"], (int, float)) and data["memory_peak_mb"] > 0.0
        assert isinstance(data["server_timestamp_ms"], int) and data["server_timestamp_ms"] > 0

        logger.info(
            f"✅ [ASSERTION 1 PASSED] Telemetry contract verified in {duration_ms:.2f}ms. "
            f"RAM Used: {data['memory_used_mb']} MB, Peak: {data['memory_peak_mb']} MB, "
            f"Hit Ratio: {data['hit_ratio_pct']}%."
        )

        # --------------------------------------------------
        # Assertion 2: Miss Counter Progression & Invalidation
        # --------------------------------------------------
        baseline_misses = data["miss_count"]
        baseline_requests = data["total_requests"]

        miss_ticker = "ZZZZ"
        await client_redis.delete(f"cache:intel:{miss_ticker}")
        await client_redis.delete(f"lock:intel:{miss_ticker}")

        bogus_resp = await http.get(f"/v1/intelligence/results/{miss_ticker}")
        assert bogus_resp.status_code == 200, f"Expected 200 for unprimed ticker, got {bogus_resp.status_code}"
        bogus_body = bogus_resp.json()
        assert bogus_body.get("cache_hit") is False, "Expected cache_hit to be False on miss"

        # Query health to verify miss counter incremented
        health_after_miss = (await http.get("/v1/intelligence/cache-health")).json()
        assert health_after_miss["miss_count"] >= baseline_misses + 1, (
            f"Miss counter did not increment. Before: {baseline_misses}, After: {health_after_miss['miss_count']}"
        )
        assert health_after_miss["total_requests"] >= baseline_requests + 1

        logger.info(
            f"✅ [ASSERTION 2 PASSED] Cache miss recorded and verified. "
            f"Miss count progressed: {baseline_misses} -> {health_after_miss['miss_count']}."
        )

        # --------------------------------------------------
        # Assertion 3: Cache Hit Progression & Hit Ratio Calculation
        # --------------------------------------------------
        baseline_hits = health_after_miss["hit_count"]

        # Pre-seed a known cache entry to ensure immediate hit
        seeded_ticker = "ZZZ"
        seeded_key = f"cache:intel:{seeded_ticker}"
        mock_payload = {
            "ticker": seeded_ticker,
            "sentiment_score": 0.88,
            "confidence": 0.95,
            "key_metrics": {"test": True},
            "news_summary": "Audit mock intelligence entry",
            "status": "COMPLETED",
            "trace_id": "audit-trace-hit",
        }
        await client_redis.set(seeded_key, json.dumps(mock_payload), ex=60)

        # Trigger read on seeded item
        hit_resp = await http.get(f"/v1/intelligence/results/{seeded_ticker}")
        assert hit_resp.status_code == 200
        hit_body = hit_resp.json()
        assert hit_body.get("cache_hit") is True, "Expected cache hit on seeded key"

        # Query health and check hit progression
        health_after_hit = (await http.get("/v1/intelligence/cache-health")).json()
        assert health_after_hit["hit_count"] >= baseline_hits + 1, (
            f"Hit counter did not increment. Before: {baseline_hits}, After: {health_after_hit['hit_count']}"
        )

        expected_ratio = round(
            (health_after_hit["hit_count"] / health_after_hit["total_requests"]) * 100, 2
        )
        assert abs(health_after_hit["hit_ratio_pct"] - expected_ratio) < 0.1, (
            f"Hit ratio calculation mismatch: got {health_after_hit['hit_ratio_pct']}%, expected {expected_ratio}%"
        )

        logger.info(
            f"✅ [ASSERTION 3 PASSED] Cache hit verified. Hits: {baseline_hits} -> {health_after_hit['hit_count']}. "
            f"Hit Ratio dynamically computed at {health_after_hit['hit_ratio_pct']}%."
        )

        # Clean up seeded key
        await client_redis.delete(seeded_key)

        # --------------------------------------------------
        # Assertion 4: Redis Key Count Consistency
        # --------------------------------------------------
        actual_keys = await client_redis.keys("cache:intel:*")
        health_check = (await http.get("/v1/intelligence/cache-health")).json()
        reported_keys = health_check["total_cached_keys"]

        assert len(actual_keys) == reported_keys, (
            f"Key count discrepancy. Redis scanner found {len(actual_keys)}, endpoint reported {reported_keys}."
        )

        logger.info(
            f"✅ [ASSERTION 4 PASSED] Key scanning accuracy verified. "
            f"Active cached intelligence entries in Redis: {reported_keys}."
        )

        # --------------------------------------------------
        # Assertion 5: Zero Regressions on Operational Endpoints
        # --------------------------------------------------
        stream_resp = await http.get("/v1/intelligence/stream-health")
        assert stream_resp.status_code == 200, f"Stream health returned {stream_resp.status_code}"

        cb_resp = await http.get("/v1/intelligence/circuit-breaker")
        assert cb_resp.status_code == 200, f"Circuit breaker returned {cb_resp.status_code}"

        dlq_resp = await http.get("/v1/intelligence/dlq", headers={"X-N8N-API-KEY": N8N_API_KEY})
        assert dlq_resp.status_code == 200, f"DLQ endpoint returned {dlq_resp.status_code}"

        logger.info(
            "✅ [ASSERTION 5 PASSED] Operational Telemetry regression check verified (/stream-health, /circuit-breaker, /dlq all 200 OK)."
        )

    await client_redis.aclose()
    logger.info("==================================================")
    logger.info("🎉 5/5 CACHE HEALTH AUDIT ASSERTIONS VERIFIED. 100% PASS.")
    logger.info("==================================================")


if __name__ == "__main__":
    asyncio.run(run_cache_health_audit())
