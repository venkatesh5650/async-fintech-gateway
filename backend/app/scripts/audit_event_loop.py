import asyncio
import logging
import sys
from pathlib import Path

import httpx
from httpx import ASGITransport

backend_root = str(Path(__file__).resolve().parent.parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.loop_monitor import EventLoopLatencyMonitor
from app.database.schemas import EventLoopLagSimulationReport, EventLoopStatus
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audit.event_loop")


async def test_baseline_event_loop_latency():
    logger.info("Running assertion 1: Validating baseline event loop latency and metrics...")
    monitor = EventLoopLatencyMonitor(redis_client=None)

    status = await monitor.get_status()
    assert isinstance(status, EventLoopStatus)
    assert status.current_lag_ms >= 0.0, "Current lag must be non-negative"
    assert status.avg_lag_ms >= 0.0, "Average lag must be non-negative"
    assert status.p95_lag_ms >= 0.0, "P95 lag must be non-negative"
    assert status.max_lag_ms >= 0.0, "Max lag must be non-negative"
    assert status.status in ["HEALTHY", "ELEVATED", "STARVED"]
    assert len(status.trace_id) > 0, "Trace ID must be present"
    assert len(status.recent_samples_ms) > 0, "Recent samples must not be empty"

    logger.info(
        f"Assertion 1 passed: Baseline operational (Current={status.current_lag_ms:.2f}ms, "
        f"Avg={status.avg_lag_ms:.2f}ms, P95={status.p95_lag_ms:.2f}ms, Status={status.status})."
    )


async def test_controlled_cpu_blocking_simulation():
    logger.info("Running assertion 2: Testing controlled CPU-bound blocking simulation and detection...")
    monitor = EventLoopLatencyMonitor(redis_client=None)
    target_ms = 40.0

    report = await monitor.simulate_blocking(
        block_duration_ms=target_ms,
        simulation_type="cpu_burn",
    )

    assert isinstance(report, EventLoopLagSimulationReport)
    assert report.status == "COMPLETED"
    assert report.target_block_ms == target_ms
    assert report.measured_lag_ms >= 20.0, (
        f"Expected measured lag >= 20ms for 40ms CPU burn, got {report.measured_lag_ms}ms"
    )
    assert report.detected_by_monitor is True, "Monitor must flag >15ms drift as blocking event"
    assert report.recovery_time_ms >= 0.0
    assert len(report.trace_id) > 0

    logger.info(
        f"Assertion 2 passed: CPU blocking detected (Target={report.target_block_ms}ms, "
        f"Measured={report.measured_lag_ms}ms, Flagged={report.detected_by_monitor}, Recovery={report.recovery_time_ms}ms)."
    )


async def test_sync_sleep_blocking_detection():
    logger.info("Running assertion 3: Testing synchronous sleep thread-blocking detection...")
    monitor = EventLoopLatencyMonitor(redis_client=None)
    target_ms = 30.0

    report = await monitor.simulate_blocking(
        block_duration_ms=target_ms,
        simulation_type="sync_sleep",
    )

    assert isinstance(report, EventLoopLagSimulationReport)
    assert report.status == "COMPLETED"
    assert report.measured_lag_ms >= 15.0, (
        f"Expected measured lag >= 15ms for 30ms sleep, got {report.measured_lag_ms}ms"
    )
    assert report.detected_by_monitor is True, "Monitor must flag sleep blocking as starvation"

    logger.info(
        f"Assertion 3 passed: Sync sleep blocking verified (Target={report.target_block_ms}ms, "
        f"Measured={report.measured_lag_ms}ms, Flagged={report.detected_by_monitor})."
    )


async def test_event_loop_recovery_and_starvation_clearing():
    logger.info("Running assertion 4: Testing rapid post-blocking recovery to healthy baseline...")
    monitor = EventLoopLatencyMonitor(redis_client=None)

    # Induce a brief blocking event
    await monitor.simulate_blocking(block_duration_ms=25.0, simulation_type="cpu_burn")

    # Allow asyncio loop to process subsequent tick
    await asyncio.sleep(0.02)

    # Validate post-burst recovery
    status = await monitor.get_status()
    assert status.current_lag_ms < 15.0, (
        f"Expected post-burst lag to clear below 15ms, got {status.current_lag_ms}ms"
    )
    assert status.blocking_events_count >= 1, "Blocking event counter must be incremented"

    logger.info(
        f"Assertion 4 passed: Event loop recovered promptly (Current={status.current_lag_ms:.2f}ms, "
        f"BlockingEvents={status.blocking_events_count})."
    )


async def test_event_loop_chaos_rest_api_contracts():
    logger.info("Running assertion 5: Testing event loop chaos REST API contracts...")
    transport = ASGITransport(app=app)
    headers = {"X-Internal-Secret": "super_secure_internal_orchestration_secret_key__2026"}

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. GET status
        res_status = await client.get("/v1/chaos/event-loop/status", headers=headers)
        assert res_status.status_code == 200, f"Expected 200 from status, got {res_status.status_code}"
        data_status = res_status.json()
        assert "current_lag_ms" in data_status
        assert "avg_lag_ms" in data_status
        assert "p95_lag_ms" in data_status
        assert "status" in data_status
        assert "recent_samples_ms" in data_status

        # 2. POST simulate
        res_sim = await client.post(
            "/v1/chaos/event-loop/simulate",
            headers=headers,
            json={"block_duration_ms": 25.0, "simulation_type": "cpu_burn"},
        )
        assert res_sim.status_code == 200, f"Expected 200 from simulate, got {res_sim.status_code}"
        data_sim = res_sim.json()
        assert data_sim["status"] == "COMPLETED"
        assert data_sim["measured_lag_ms"] > 0
        assert data_sim["target_block_ms"] == 25.0

        # 3. GET latest report
        res_latest = await client.get("/v1/chaos/event-loop/latest", headers=headers)
        assert res_latest.status_code == 200, f"Expected 200 from latest report, got {res_latest.status_code}"
        data_latest = res_latest.json()
        assert data_latest["status"] == "COMPLETED"

    logger.info("Assertion 5 passed: Event loop chaos REST API contracts verified.")


async def run_event_loop_audit():
    logger.info("=================================================================")
    logger.info("STARTING ASGI EVENT-LOOP LATENCY & STARVATION AUDIT SUITE")
    logger.info("=================================================================")

    tests = [
        test_baseline_event_loop_latency,
        test_controlled_cpu_blocking_simulation,
        test_sync_sleep_blocking_detection,
        test_event_loop_recovery_and_starvation_clearing,
        test_event_loop_chaos_rest_api_contracts,
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
    asyncio.run(run_event_loop_audit())
