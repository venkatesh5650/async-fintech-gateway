import sys
import os
import time
import json
import uuid
import asyncio
import logging
import httpx
import redis.asyncio as redis

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.cache import cache_aside_manager, LUA_RELEASE_LOCK

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_stampede_prevention")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
N8N_API_KEY = os.getenv("N8N_API_KEY", "super_secure_internal_orchestration_secret_key__2026")


async def run_stampede_prevention_audit():
    logger.info("==================================================")
    logger.info("AUDIT: Distributed Mutex & Stampede Prevention")
    logger.info("==================================================")

    client_redis = redis.from_url(REDIS_URL, decode_responses=True)
    test_ticker = "NVDA"
    cache_key = f"cache:intel:{test_ticker}"
    lock_key = f"lock:intel:{test_ticker}"

    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=15.0) as http:
        # Pre-clean test keys
        await client_redis.delete(cache_key)
        await client_redis.delete(lock_key)

        # --------------------------------------------------
        # Assertion 1: Atomic Mutex Leasing & Safe Lua Release
        # --------------------------------------------------
        t0 = time.perf_counter()
        token_a = str(uuid.uuid4())
        token_b = str(uuid.uuid4())

        # Acquire lock
        acquired_a = await client_redis.set(lock_key, token_a, nx=True, ex=5)
        assert acquired_a is True, "Failed to acquire free mutex lock"

        # Mutual exclusion: Second request must fail to acquire
        acquired_b = await client_redis.set(lock_key, token_b, nx=True, ex=5)
        assert acquired_b is None, "Mutual exclusion violation: Second token acquired active lock"

        # Verify TTL is active
        ttl = await client_redis.ttl(lock_key)
        assert 0 < ttl <= 5, f"Expected lock TTL between 1 and 5s, got {ttl}"

        # Unauthorized release attempt
        unauth_del = await client_redis.eval(LUA_RELEASE_LOCK, 1, lock_key, token_b)
        assert unauth_del == 0, "Security fault: Lock was released with incorrect token"

        # Authorized release
        auth_del = await client_redis.eval(LUA_RELEASE_LOCK, 1, lock_key, token_a)
        assert auth_del == 1, "Failed to release lock with authentic token"

        lock_after = await client_redis.get(lock_key)
        assert lock_after is None, "Lock key persisted after authorized release"
        latency1 = (time.perf_counter() - t0) * 1000

        logger.info(
            f"✅ [ASSERTION 1 PASSED] Atomic mutex leasing & Lua release primitives verified in {latency1:.2f}ms"
        )

        # --------------------------------------------------
        # Assertion 2: Contention & Follower Lock Wait Telemetry
        # --------------------------------------------------
        await client_redis.delete(cache_key)
        await client_redis.delete(lock_key)

        hold_token = str(uuid.uuid4())
        await client_redis.set(lock_key, hold_token, nx=True, ex=3)

        async def prime_and_release_after(delay_sec: float):
            await asyncio.sleep(delay_sec)
            mock_entry = {
                "ticker": test_ticker,
                "signal": "BUY",
                "analysis_report": "Lock contention resolution report.",
                "execution_time_ms": 120.0,
                "source": "WRITE_THROUGH",
                "primed_at": "2026-09-22T08:00:00Z",
            }
            await client_redis.set(cache_key, json.dumps(mock_entry), ex=300)
            await client_redis.eval(LUA_RELEASE_LOCK, 1, lock_key, hold_token)

        release_task = asyncio.create_task(prime_and_release_after(0.15))

        t_wait_start = time.perf_counter()
        contended_resp = await http.get(f"/v1/intelligence/results/{test_ticker}")
        await release_task

        assert contended_resp.status_code == 200, f"Expected 200 OK, got {contended_resp.status_code}"
        contended_data = contended_resp.json()

        assert contended_data.get("cache_hit") is True
        assert contended_data.get("mutex_contention") is True, f"Expected mutex_contention=True, got {contended_data.get('mutex_contention')}"
        assert contended_data.get("prime_origin") == "MUTEX_WAIT", f"Expected prime_origin='MUTEX_WAIT', got {contended_data.get('prime_origin')}"
        assert contended_data.get("lock_wait_ms") is not None and contended_data.get("lock_wait_ms") >= 50.0, (
            f"Expected lock_wait_ms >= 50ms, got {contended_data.get('lock_wait_ms')}"
        )
        logger.info(
            f"✅ [ASSERTION 2 PASSED] Mutex contention & lock wait verified: "
            f"contention={contended_data.get('mutex_contention')} wait={contended_data.get('lock_wait_ms')}ms"
        )

        # --------------------------------------------------
        # Assertion 3: Thundering Herd Burst Simulation (Single Leader)
        # --------------------------------------------------
        await client_redis.delete(cache_key)
        await client_redis.delete(lock_key)

        burst_size = 15
        logger.info(f"Simulating cold thundering herd: Dispatching {burst_size} concurrent requests...")

        t_burst = time.perf_counter()
        tasks = [http.get(f"/v1/intelligence/results/{test_ticker}") for _ in range(burst_size)]
        responses = await asyncio.gather(*tasks)
        burst_duration_ms = (time.perf_counter() - t_burst) * 1000

        assert len(responses) == burst_size
        results_data = []
        for idx, resp in enumerate(responses):
            assert resp.status_code == 200, f"Request {idx} failed with {resp.status_code}"
            results_data.append(resp.json())

        leaders = [r for r in results_data if r.get("source") == "DATABASE"]
        cache_served = [r for r in results_data if r.get("source") == "CACHE"]

        assert len(leaders) == 1, f"Expected exactly 1 Leader database fetch, but got {len(leaders)}"
        assert len(cache_served) == burst_size - 1, (
            f"Expected {burst_size - 1} requests served from cache, got {len(cache_served)}"
        )
        logger.info(
            f"✅ [ASSERTION 3 PASSED] Thundering herd burst absorbed in {burst_duration_ms:.2f}ms: "
            f"1 Leader database hit, {len(cache_served)} requests served from Redis memory"
        )

        # --------------------------------------------------
        # Assertion 4: Post-Stampede Warm Cache Retrieval
        # --------------------------------------------------
        t_warm = time.perf_counter()
        warm_resp = await http.get(f"/v1/intelligence/results/{test_ticker}")
        warm_duration_ms = (time.perf_counter() - t_warm) * 1000

        assert warm_resp.status_code == 200
        warm_data = warm_resp.json()
        assert warm_data.get("cache_hit") is True
        assert warm_data.get("mutex_contention") is False
        assert warm_data.get("lock_wait_ms") == 0.0

        logger.info(
            f"✅ [ASSERTION 4 PASSED] Post-stampede warm cache verified in {warm_duration_ms:.2f}ms "
            f"(Cache I/O: {warm_data.get('data_source_latency_ms')}ms)"
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

    await client_redis.aclose()
    logger.info("==================================================")
    logger.info("🎉 5/5 STAMPEDE PREVENTION ASSERTIONS VERIFIED. 100% PASS.")
    logger.info("==================================================")


if __name__ == "__main__":
    asyncio.run(run_stampede_prevention_audit())
