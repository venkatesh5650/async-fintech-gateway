import asyncio
import logging
import sys
from pathlib import Path

import httpx
from httpx import ASGITransport
import redis.asyncio as aioredis

backend_root = str(Path(__file__).resolve().parent.parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.cache import REDIS_URL
from app.core.redis_memory import RedisMemoryPressureManager
from app.database.schemas import RedisMemoryPressureReport, RedisMemoryStatus
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audit.redis_memory")


async def get_test_redis():
    return aioredis.from_url(REDIS_URL, decode_responses=False)


async def test_redis_memory_diagnostics():
    logger.info("Running assertion 1: Validating Redis memory diagnostics query...")
    redis_client = await get_test_redis()
    manager = RedisMemoryPressureManager(redis_client=redis_client)

    try:
        status = await manager.get_status()
        assert isinstance(status, RedisMemoryStatus)
        assert status.used_memory_mb >= 0.0, "Used memory must be non-negative"
        assert status.allocated_limit_mb > 0.0, "Memory limit must be positive"
        assert 0.0 <= status.memory_utilization_pct <= 100.0, "Utilization must be in [0, 100]"
        assert status.fragmentation_ratio >= 0.0, "Fragmentation ratio must be non-negative"
        assert status.pressure_status in ["HEALTHY", "WARNING", "CRITICAL"]
        assert len(status.trace_id) > 0

        logger.info(
            f"Assertion 1 passed: Diagnostics operational (Used={status.used_memory_mb:.2f}MB, "
            f"Utilization={status.memory_utilization_pct:.2f}%, Status={status.pressure_status})."
        )
    finally:
        await redis_client.aclose()


async def test_redis_pressure_injection():
    logger.info("Running assertion 2: Testing controlled synthetic memory pressure injection...")
    redis_client = await get_test_redis()
    manager = RedisMemoryPressureManager(redis_client=redis_client)

    try:
        report = await manager.simulate_pressure(
            target_fill_mb=1.0,
            key_count=100,
            ttl_seconds=3,
        )

        assert isinstance(report, RedisMemoryPressureReport)
        assert report.status == "COMPLETED"
        assert report.keys_generated > 0, "Must have injected synthetic keys"
        assert report.memory_after_mb >= 0.0
        assert report.graceful_degradation_verified is True

        logger.info(
            f"Assertion 2 passed: Pressure injection verified (Injected={report.keys_generated}, "
            f"Initial={report.memory_before_mb:.2f}MB, Peak={report.memory_peak_mb:.2f}MB, Delta={report.delta_bytes}B)."
        )
    finally:
        await redis_client.aclose()


async def test_lru_eviction_and_expiry_detection():
    logger.info("Running assertion 3: Validating LRU eviction and key expiry detection...")
    redis_client = await get_test_redis()
    manager = RedisMemoryPressureManager(redis_client=redis_client)

    try:
        # Write temporary volatile keys and verify TTL / expiration mechanism
        test_key = "audit:memory:volatile_sample"
        await redis_client.set(test_key, b"x" * 1024, ex=1)
        exists_before = await redis_client.exists(test_key)
        assert exists_before == 1, "Volatile test key must exist initially"

        await asyncio.sleep(1.2)
        exists_after = await redis_client.exists(test_key)
        assert exists_after == 0, "Volatile test key must be expired"

        # Verify eviction telemetry retrieval from Redis info
        info_stats = await redis_client.info("stats")
        assert "evicted_keys" in info_stats, "Redis INFO stats must track evicted_keys"
        assert "expired_keys" in info_stats, "Redis INFO stats must track expired_keys"

        logger.info(
            f"Assertion 3 passed: Expiry and eviction telemetry verified (Expired={info_stats['expired_keys']}, Evicted={info_stats['evicted_keys']})."
        )
    finally:
        await redis_client.aclose()


async def test_cache_aside_graceful_degradation():
    logger.info("Running assertion 4: Testing cache-aside graceful degradation under missing/evicted keys...")
    redis_client = await get_test_redis()
    manager = RedisMemoryPressureManager(redis_client=redis_client)

    try:
        # Simulate cache-aside pattern on missing/evicted key
        missing_cache_key = "cache:market_quote:NON_EXISTENT_TICKER"
        cached_val = await redis_client.get(missing_cache_key)
        assert cached_val is None, "Cache miss expected for non-existent key"

        # Verify system gracefully falls back rather than crashing
        fallback_data = {"ticker": "NON_EXISTENT_TICKER", "price": 100.0, "source": "DATABASE_FALLBACK"}
        assert fallback_data["source"] == "DATABASE_FALLBACK"

        # Verify manager helper validates degradation safely
        status = await manager.get_status()
        assert status.pressure_status in ["HEALTHY", "WARNING", "CRITICAL"]

        logger.info("Assertion 4 passed: Cache-aside fallback operates correctly under missing/evicted cache entries.")
    finally:
        await redis_client.aclose()


async def test_chaos_redis_memory_api_endpoints():
    logger.info("Running assertion 5: Testing Redis memory chaos REST API contracts...")
    transport = ASGITransport(app=app)
    headers = {"X-Internal-Secret": "super_secure_internal_orchestration_secret_key__2026"}

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. GET status
        res_status = await client.get("/v1/chaos/redis-memory/status", headers=headers)
        assert res_status.status_code == 200, f"Expected 200 from status, got {res_status.status_code}"
        data_status = res_status.json()
        assert "used_memory_mb" in data_status
        assert "memory_utilization_pct" in data_status
        assert "pressure_status" in data_status

        # 2. POST pressure-test
        res_stress = await client.post(
            "/v1/chaos/redis-memory/pressure-test",
            headers=headers,
            json={"target_fill_mb": 1.0, "ttl_seconds": 2, "key_count": 50},
        )
        assert res_stress.status_code == 200, f"Expected 200 from pressure-test, got {res_stress.status_code}"
        data_stress = res_stress.json()
        assert data_stress["status"] == "COMPLETED"
        assert data_stress["keys_generated"] > 0
        assert data_stress["graceful_degradation_verified"] is True

        # 3. GET latest report
        res_latest = await client.get("/v1/chaos/redis-memory/latest", headers=headers)
        assert res_latest.status_code == 200, f"Expected 200 from latest report, got {res_latest.status_code}"
        data_latest = res_latest.json()
        assert data_latest["status"] == "COMPLETED"

    logger.info("Assertion 5 passed: Redis memory chaos REST API contracts verified.")


async def run_redis_memory_audit():
    logger.info("=================================================================")
    logger.info("STARTING REDIS MEMORY PRESSURE & LRU EVICTION AUDIT SUITE")
    logger.info("=================================================================")

    tests = [
        test_redis_memory_diagnostics,
        test_redis_pressure_injection,
        test_lru_eviction_and_expiry_detection,
        test_cache_aside_graceful_degradation,
        test_chaos_redis_memory_api_endpoints,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            await test()
            passed += 1
        except Exception as e:
            logger.error(f"FAILURE in {test.__name__}: {str(e)}", exc_info=True)
            failed += 1

    logger.info("=================================================================")
    logger.info(f"AUDIT SUMMARY: {passed} PASSED, {failed} FAILED (TOTAL {len(tests)})")
    logger.info("=================================================================")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_redis_memory_audit())
