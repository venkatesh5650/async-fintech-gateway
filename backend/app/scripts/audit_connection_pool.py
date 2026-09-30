import asyncio
import logging
import sys
from pathlib import Path

import httpx
from httpx import ASGITransport
from sqlalchemy import text

backend_root = str(Path(__file__).resolve().parent.parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.pool_chaos import ConnectionPoolDiagnosticManager
from app.database.database import engine
from app.database.schemas import ConnectionPoolStatus, ConnectionPoolStressReport
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audit.pool_chaos")


async def test_pool_status_diagnostics():
    logger.info("Running assertion 1: Validating connection pool diagnostics...")
    manager = ConnectionPoolDiagnosticManager(redis_client=None)
    status = await manager.get_status(engine=engine)

    assert isinstance(status, ConnectionPoolStatus)
    assert status.pool_size > 0, "Pool size must be positive"
    assert status.total_capacity >= status.pool_size
    assert 0.0 <= status.saturation_pct <= 100.0
    assert status.avg_checkout_latency_ms >= 0.0
    assert len(status.trace_id) > 0

    logger.info(
        f"Assertion 1 passed: Pool diagnostics operational (Size={status.pool_size}, Capacity={status.total_capacity}, Ping={status.avg_checkout_latency_ms}ms)."
    )


async def test_pool_starvation_simulation():
    logger.info("Running assertion 2: Testing controlled pool starvation and recovery...")
    manager = ConnectionPoolDiagnosticManager(redis_client=None)
    concurrency_target = 15

    report = await manager.simulate_starvation(
        engine=engine,
        concurrency=concurrency_target,
        hold_duration=1.0,
    )

    assert isinstance(report, ConnectionPoolStressReport)
    assert report.status == "COMPLETED"
    assert report.acquired_connections > 0
    assert report.peak_saturation_pct > 0.0
    assert report.avg_queue_wait_ms >= 0.0
    assert report.recovery_time_ms >= 0.0

    # Ensure all held connections were completely released
    await asyncio.sleep(0.1)
    active_checked_out = engine.pool.checkedout()
    assert active_checked_out == 0, f"Leaked connections detected: {active_checked_out} connections still checked out"

    logger.info(
        f"Assertion 2 passed: Starvation contained (Acquired={report.acquired_connections}/{report.requested_connections}, Recovery={report.recovery_time_ms}ms, Leak=0)."
    )


async def test_zero_deadlock_post_starvation():
    logger.info("Running assertion 3: Validating post-starvation transaction resilience...")
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1 AS probe"))
        val = result.scalar()
        assert val == 1, "Database query failed after starvation cycle"

    logger.info("Assertion 3 passed: Database connectivity intact post-stress cycle.")


async def test_pool_rest_endpoints():
    logger.info("Running assertion 4: Testing REST pool endpoints (/v1/chaos/pool/*)...")
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # GET status
        res_status = await client.get("/v1/chaos/pool/status")
        assert res_status.status_code == 200
        status_data = res_status.json()
        assert "saturation_pct" in status_data
        assert "total_capacity" in status_data

        # POST stress run
        res_stress = await client.post(
            "/v1/chaos/pool/stress",
            json={"concurrency": 10, "hold_duration_seconds": 1.0},
        )
        assert res_stress.status_code == 200
        stress_data = res_stress.json()
        assert stress_data.get("status") == "COMPLETED"
        assert stress_data.get("acquired_connections") > 0

        # GET latest
        res_latest = await client.get("/v1/chaos/pool/latest")
        assert res_latest.status_code == 200
        latest_data = res_latest.json()
        assert "peak_saturation_pct" in latest_data

    logger.info("Assertion 4 passed: Pool REST contracts verified.")


async def test_pool_collision_prevention():
    logger.info("Running assertion 5: Testing concurrent stress run collision handling...")
    manager = ConnectionPoolDiagnosticManager(redis_client=None)

    task1 = asyncio.create_task(manager.simulate_starvation(engine=engine, concurrency=5, hold_duration=1.5))
    await asyncio.sleep(0.05)

    collision_intercepted = False
    try:
        await manager.simulate_starvation(engine=engine, concurrency=5, hold_duration=0.5)
    except RuntimeError:
        collision_intercepted = True

    await task1
    assert collision_intercepted, "Concurrent starvation simulation was not guarded"

    logger.info("Assertion 5 passed: Starvation collision mutex verified.")


async def main():
    logger.info("Starting Connection Pool Chaos & Recovery Audit...")
    try:
        await test_pool_status_diagnostics()
        await test_pool_starvation_simulation()
        await test_zero_deadlock_post_starvation()
        await test_pool_rest_endpoints()
        await test_pool_collision_prevention()
        logger.info("Connection Pool Audit: 5/5 assertions passed (100% SUCCESS).")
    except AssertionError as err:
        logger.error(f"Audit assertion failure: {err}", exc_info=True)
        sys.exit(1)
    except Exception as exc:
        logger.error(f"Unexpected audit exception: {exc}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
