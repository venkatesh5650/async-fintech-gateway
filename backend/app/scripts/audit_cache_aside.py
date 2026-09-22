import sys
import os
import time
import logging
import httpx
import redis.asyncio as redis

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_cache_aside")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
N8N_API_KEY = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key__2026")


async def test_cache_aside_lifecycle():
    logger.info("==================================================")
    logger.info("AUDIT: Cache-Aside Read Optimization Layer")
    logger.info("==================================================")

    client_redis = redis.from_url(REDIS_URL, decode_responses=True)
    test_ticker = "NVDA"
    cache_key = f"cache:intel:{test_ticker}"

    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=10.0) as http:
        # Pre-clean test key
        await client_redis.delete(cache_key)

        # --------------------------------------------------
        # Assertion 1: Cache Miss on Cold Read
        # --------------------------------------------------
        t0 = time.perf_counter()
        resp1 = await http.get(f"/v1/intelligence/results/{test_ticker}")
        latency1 = (time.perf_counter() - t0) * 1000

        assert resp1.status_code == 200, f"Expected 200 OK, got {resp1.status_code}: {resp1.text}"
        data1 = resp1.json()

        assert data1.get("cache_hit") is False, f"Expected cache_hit=False on cold read, got {data1.get('cache_hit')}"
        assert data1.get("source") == "DATABASE", f"Expected source='DATABASE', got {data1.get('source')}"
        assert data1.get("ticker") == test_ticker, f"Expected ticker={test_ticker}, got {data1.get('ticker')}"
        logger.info(
            f"✅ [ASSERTION 1 PASSED] Cold Read (Cache Miss) verified: source={data1.get('source')} "
            f"in {latency1:.2f}ms (DB latency: {data1.get('data_source_latency_ms')}ms)"
        )

        # --------------------------------------------------
        # Assertion 2: Cache Key Priming Verification
        # --------------------------------------------------
        raw_cached = await client_redis.get(cache_key)
        assert raw_cached is not None, f"Expected Redis key '{cache_key}' to exist after cold read priming."
        ttl = await client_redis.ttl(cache_key)
        assert 0 < ttl <= 300, f"Expected 0 < TTL <= 300, got {ttl}"
        logger.info(
            f"✅ [ASSERTION 2 PASSED] Auto-priming in Redis verified: key='{cache_key}' TTL={ttl}s"
        )

        # --------------------------------------------------
        # Assertion 3: Cache Hit on Warm Read
        # --------------------------------------------------
        t1 = time.perf_counter()
        resp2 = await http.get(f"/v1/intelligence/results/{test_ticker}")
        latency2 = (time.perf_counter() - t1) * 1000

        assert resp2.status_code == 200, f"Expected 200 OK, got {resp2.status_code}"
        data2 = resp2.json()

        assert data2.get("cache_hit") is True, f"Expected cache_hit=True on warm read, got {data2.get('cache_hit')}"
        assert data2.get("source") == "CACHE", f"Expected source='CACHE', got {data2.get('source')}"
        assert data2.get("cache_ttl_remaining") <= 300, f"Invalid TTL remaining: {data2.get('cache_ttl_remaining')}"
        logger.info(
            f"✅ [ASSERTION 3 PASSED] Warm Read (Cache Hit) verified: source={data2.get('source')} "
            f"in {latency2:.2f}ms (Redis latency: {data2.get('data_source_latency_ms')}ms | TTL: {data2.get('cache_ttl_remaining')}s)"
        )

        # --------------------------------------------------
        # Assertion 4: Explicit Cache Invalidation & Re-miss
        # --------------------------------------------------
        inval_resp = await http.post(
            f"/v1/intelligence/cache/invalidate/{test_ticker}",
            headers={"X-N8N-API-KEY": N8N_API_KEY}
        )
        assert inval_resp.status_code == 200, f"Invalidation failed: {inval_resp.text}"
        inval_data = inval_resp.json()
        assert inval_data.get("evicted") is True, f"Expected evicted=True, got {inval_data.get('evicted')}"

        key_after_inval = await client_redis.get(cache_key)
        assert key_after_inval is None, f"Expected key to be purged, but it still exists: {key_after_inval}"

        # Re-read should miss again
        resp3 = await http.get(f"/v1/intelligence/results/{test_ticker}")
        assert resp3.status_code == 200
        data3 = resp3.json()
        assert data3.get("cache_hit") is False, "Expected cache miss after eviction"
        assert data3.get("source") == "DATABASE"
        logger.info(
            f"✅ [ASSERTION 4 PASSED] Cache Invalidation and Post-Eviction Miss verified."
        )

        # --------------------------------------------------
        # Assertion 5: Zero Regressions on Operational Endpoints
        # --------------------------------------------------
        health_resp = await http.get("/v1/intelligence/stream-health")
        assert health_resp.status_code == 200, f"Stream health failed: {health_resp.status_code}"

        cb_resp = await http.get("/v1/intelligence/circuit-breaker")
        assert cb_resp.status_code == 200, f"Circuit breaker failed: {cb_resp.status_code}"

        logger.info(
            f"✅ [ASSERTION 5 PASSED] Operational Telemetry regression check verified (/stream-health and /circuit-breaker both 200 OK)."
        )

    await client_redis.aclose()
    logger.info("==================================================")
    logger.info("🎉 5/5 CACHE-ASIDE ASSERTIONS VERIFIED. 100% PASS.")
    logger.info("==================================================")


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_cache_aside_lifecycle())
