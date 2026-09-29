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
from app.core.load_tester import SyntheticLoadTester
from app.core.loop_monitor import EventLoopLatencyMonitor
from app.core.pool_chaos import ConnectionPoolDiagnosticManager
from app.core.redis_memory import RedisMemoryPressureManager
from app.core.worker_chaos import WorkerChaosRecoveryManager
from app.database.database import engine
from app.database.schemas import (
    ChaosSystemOverview,
    ConnectionPoolStressReport,
    EventLoopLagSimulationReport,
    LoadTestReport,
    RedisMemoryPressureReport,
    WorkerChaosRecoveryReport,
)
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audit.chaos_capstone")


async def get_test_redis():
    return aioredis.from_url(REDIS_URL, decode_responses=True)


async def test_high_throughput_load_testing():
    logger.info("Running assertion 1: Validating load testing engine and quantile monotonicity...")
    redis_client = await get_test_redis()
    tester = SyntheticLoadTester(redis_client=redis_client)

    try:
        report = await tester.execute_load_test(
            app=app,
            concurrency=5,
            duration_seconds=1.5,
        )

        assert isinstance(report, LoadTestReport)
        assert report.status == "COMPLETED"
        assert report.total_requests > 0
        assert report.requests_per_second >= 0.0

        # Monotonic quantile integrity
        assert report.latency_p50_ms <= report.latency_p90_ms <= report.latency_p95_ms <= report.latency_p99_ms, (
            f"Percentiles non-monotonic: P50={report.latency_p50_ms}, P90={report.latency_p90_ms}, "
            f"P95={report.latency_p95_ms}, P99={report.latency_p99_ms}"
        )

        logger.info(
            f"Assertion 1 passed: Load test verified (RPS={report.requests_per_second:.1f}, "
            f"P50={report.latency_p50_ms}ms, P95={report.latency_p95_ms}ms, P99={report.latency_p99_ms}ms)."
        )
    finally:
        await redis_client.aclose()


async def test_database_connection_pool_chaos():
    logger.info("Running assertion 2: Testing database connection pool starvation and recovery SLA...")
    manager = ConnectionPoolDiagnosticManager(redis_client=None)

    status_before = await manager.get_status(engine=engine)
    assert status_before.pool_size > 0

    report = await manager.simulate_starvation(
        engine=engine,
        concurrency=10,
        hold_duration=0.5,
    )

    assert isinstance(report, ConnectionPoolStressReport)
    assert report.status == "COMPLETED"
    assert report.acquired_connections > 0
    assert report.recovery_time_ms >= 0.0

    # Ensure zero connection leakage
    status_after = await manager.get_status(engine=engine)
    assert status_after.checked_out == 0, "All checked-out connections must be returned to pool"

    logger.info(
        f"Assertion 2 passed: Pool starvation contained (Acquired={report.acquired_connections}, "
        f"Recovery={report.recovery_time_ms}ms, ActivePost={status_after.checked_out})."
    )


async def test_redis_memory_pressure_and_eviction():
    logger.info("Running assertion 3: Testing Redis memory pressure, LRU eviction, and graceful degradation...")
    redis_client = await get_test_redis()
    manager = RedisMemoryPressureManager(redis_client=redis_client)

    try:
        report = await manager.simulate_pressure(
            target_fill_mb=1.0,
            key_count=50,
            ttl_seconds=2,
        )

        assert isinstance(report, RedisMemoryPressureReport)
        assert report.status == "COMPLETED"
        assert report.keys_generated > 0
        assert report.graceful_degradation_verified is True

        logger.info(
            f"Assertion 3 passed: Memory pressure handled (Keys={report.keys_generated}, "
            f"Peak={report.memory_peak_mb}MB, DegradationVerified={report.graceful_degradation_verified})."
        )
    finally:
        await redis_client.aclose()


async def test_event_loop_latency_and_starvation_detection():
    logger.info("Running assertion 4: Testing ASGI event-loop scheduling drift and blocking detection...")
    monitor = EventLoopLatencyMonitor(redis_client=None)

    report = await monitor.simulate_blocking(
        block_duration_ms=30.0,
        simulation_type="cpu_burn",
    )

    assert isinstance(report, EventLoopLagSimulationReport)
    assert report.status == "COMPLETED"
    assert report.measured_lag_ms >= 15.0
    assert report.detected_by_monitor is True
    assert report.recovery_time_ms >= 0.0

    logger.info(
        f"Assertion 4 passed: Event loop drift monitored (Measured={report.measured_lag_ms}ms, "
        f"Flagged={report.detected_by_monitor}, Recovery={report.recovery_time_ms}ms)."
    )


async def test_worker_kill_autoclaim_and_system_overview():
    logger.info("Running assertion 5: Testing worker kill, Redis Streams XAUTOCLAIM recovery, and system resilience...")
    redis_client = await get_test_redis()
    manager = WorkerChaosRecoveryManager(redis_client=redis_client)

    try:
        # 1. Run controlled worker kill and auto-claim recovery
        report = await manager.simulate_worker_kill_and_recovery(
            orphaned_count=2,
            min_idle_time_ms=150,
            consumer_dead_name="capstone_victim_worker",
            consumer_recovery_name="capstone_rescuer_worker",
        )

        assert isinstance(report, WorkerChaosRecoveryReport)
        assert report.status == "COMPLETED"
        assert len(report.orphaned_message_ids) == 2
        assert len(report.claimed_message_ids) == 2
        assert report.pel_cleared is True
        assert report.sla_met is True
        assert report.recovery_time_ms < 30000.0

        # 2. Validate Capstone REST API Endpoints via ASGI Transport
        transport = ASGITransport(app=app)
        headers = {"X-Internal-Secret": "super_secure_internal_orchestration_secret_key__2026"}

        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            res_overview = await client.get("/v1/chaos/overview", headers=headers)
            assert res_overview.status_code == 200, f"Expected 200 from overview, got {res_overview.status_code}"
            data_overview = res_overview.json()
            assert data_overview["resilience_score_pct"] >= 80.0
            assert data_overview["load_testing_status"] in ["HEALTHY", "ACTIVE"]
            assert data_overview["connection_pool_status"] in ["HEALTHY", "ELEVATED"]
            assert data_overview["redis_memory_status"] in ["HEALTHY", "ELEVATED", "CRITICAL"]
            assert data_overview["event_loop_status"] in ["HEALTHY", "ELEVATED", "STARVED"]
            assert data_overview["worker_recovery_status"] in ["HEALTHY", "ACTIVE"]

            res_worker_latest = await client.get("/v1/chaos/worker-kill/latest", headers=headers)
            assert res_worker_latest.status_code == 200
            data_worker = res_worker_latest.json()
            assert data_worker["status"] == "COMPLETED"

        logger.info(
            f"Assertion 5 passed: Worker kill recovery verified (Claimed={len(report.claimed_message_ids)}, "
            f"PEL_Cleared={report.pel_cleared}, SLA_Met={report.sla_met}, ResilienceScore={data_overview['resilience_score_pct']}%)."
        )
    finally:
        await redis_client.aclose()


async def run_milestone5_capstone_audit():
    logger.info("=================================================================")
    logger.info("STARTING PHASE 2 MILESTONE 5 CAPSTONE CHAOS AUDIT SUITE")
    logger.info("=================================================================")

    tests = [
        test_high_throughput_load_testing,
        test_database_connection_pool_chaos,
        test_redis_memory_pressure_and_eviction,
        test_event_loop_latency_and_starvation_detection,
        test_worker_kill_autoclaim_and_system_overview,
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
    logger.info(f"CAPSTONE AUDIT SUMMARY: {passed} PASSED, {failed} FAILED (TOTAL {len(tests)})")
    logger.info("=================================================================")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_milestone5_capstone_audit())
