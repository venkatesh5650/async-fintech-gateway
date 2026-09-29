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

from app.core.load_tester import (
    SyntheticLoadTester,
    calculate_percentile,
)
from app.database.schemas import LoadTestReport
from app.main import app
import subprocess

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("audit.day81")


async def test_locustfile_structure():
    logger.info("Running assertion 1: Validating Locust test harness tasks via CLI parser...")
    locust_path = str(Path(__file__).resolve().parent / "locustfile.py")
    
    proc = subprocess.run(
        [sys.executable, "-m", "locust", "-f", locust_path, "--show-task-ratio"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, f"Locust parser failed with code {proc.returncode}: {proc.stderr}"
    output = proc.stdout
    
    expected_tasks = [
        "submit_batch_intelligence",
        "assault_market_ingestion",
        "query_analytics_metrics",
        "inspect_system_telemetry",
    ]
    for expected in expected_tasks:
        assert expected in output, f"Missing task in locust output: {expected}"

    logger.info("Assertion 1 passed: Locust task harness verified via native CLI parser.")


async def test_percentile_math():
    logger.info("Running assertion 2: Validating quantile math calculations...")
    latencies = [10.0, 12.0, 15.0, 18.0, 20.0, 25.0, 30.0, 45.0, 60.0, 120.0]
    p50 = calculate_percentile(latencies, 50.0)
    p90 = calculate_percentile(latencies, 90.0)
    p95 = calculate_percentile(latencies, 95.0)
    p99 = calculate_percentile(latencies, 99.0)

    assert p50 <= p90 <= p95 <= p99, f"Quantile monotonicity violated: {p50} <= {p90} <= {p95} <= {p99}"
    assert 15.0 <= p50 <= 25.0, f"Unexpected P50 value: {p50}"
    assert p99 >= 60.0, f"Unexpected P99 value: {p99}"

    logger.info(f"Assertion 2 passed: Quantile math monotonic (P50={p50}ms, P90={p90}ms, P95={p95}ms, P99={p99}ms).")


async def test_synthetic_load_engine():
    logger.info("Running assertion 3: Executing synthetic load test against ASGI application...")
    tester = SyntheticLoadTester(redis_client=None)

    report = await tester.execute_load_test(
        app=app,
        concurrency=10,
        duration_seconds=3.0,
    )

    assert isinstance(report, LoadTestReport)
    assert report.status == "COMPLETED"
    assert report.total_requests > 0, "No requests executed during load test"
    assert report.requests_per_second > 0, "RPS must be strictly positive"
    assert report.failure_rate_pct < 5.0, f"Failure rate exceeded threshold: {report.failure_rate_pct}%"
    assert report.latency_p50_ms <= report.latency_p99_ms
    assert len(report.endpoint_breakdown) >= 3, "Missing endpoint breakdowns in report"

    logger.info(
        f"Assertion 3 passed: Load engine completed (Requests={report.total_requests}, RPS={report.requests_per_second}, FailRate={report.failure_rate_pct}%)."
    )


async def test_chaos_router_endpoints():
    logger.info("Running assertion 4: Testing REST endpoints (/v1/chaos/load-test/*)...")
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Test status endpoint
        res_status = await client.get("/v1/chaos/status")
        assert res_status.status_code == 200
        assert res_status.json().get("status") == "operational"

        # Test latest load test report
        res_latest = await client.get("/v1/chaos/load-test/latest")
        assert res_latest.status_code == 200
        latest_data = res_latest.json()
        assert "requests_per_second" in latest_data
        assert "latency_p50_ms" in latest_data
        assert "endpoint_breakdown" in latest_data

        # Test trigger load test endpoint
        res_run = await client.post(
            "/v1/chaos/load-test/run",
            json={"concurrency": 8, "duration_seconds": 3},
        )
        assert res_run.status_code == 200
        run_data = res_run.json()
        assert run_data.get("status") == "COMPLETED"
        assert run_data.get("total_requests") > 0

    logger.info("Assertion 4 passed: Chaos REST endpoints conform to contract.")


async def test_concurrency_error_containment():
    logger.info("Running assertion 5: Testing concurrent execution collision handling...")
    tester = SyntheticLoadTester(redis_client=None)

    # Start first run
    task1 = asyncio.create_task(
        tester.execute_load_test(app=app, concurrency=5, duration_seconds=2.0)
    )
    await asyncio.sleep(0.05)

    # Second concurrent execution must raise RuntimeError
    collision_prevented = False
    try:
        await tester.execute_load_test(app=app, concurrency=5, duration_seconds=1.0)
    except RuntimeError:
        collision_prevented = True

    await task1
    assert collision_prevented, "Concurrent test execution collision was not prevented"

    logger.info("Assertion 5 passed: Mutex collision guard verified.")


async def main():
    logger.info("Starting Day 81 Stress Testing & Locust Harness Audit...")
    try:
        await test_locustfile_structure()
        await test_percentile_math()
        await test_synthetic_load_engine()
        await test_chaos_router_endpoints()
        await test_concurrency_error_containment()
        logger.info("Day 81 Audit: 5/5 assertions passed (100% SUCCESS).")
    except AssertionError as err:
        logger.error(f"Audit failure assertion: {err}", exc_info=True)
        sys.exit(1)
    except Exception as exc:
        logger.error(f"Unexpected audit error: {exc}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
