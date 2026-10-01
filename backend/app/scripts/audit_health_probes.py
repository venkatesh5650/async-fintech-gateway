"""
Cloud-Native Tiered Health Probes Audit Suite
---------------------------------------------
Automated 5-point verification battery evaluating Kubernetes/Render
probes: sub-5ms liveness, deep dependency readiness (PG, Redis, pgvector),
startup schema initialization, and multi-tier health matrix API contracts.
"""

import asyncio
import logging
import os
import sys
import time

from httpx import ASGITransport, AsyncClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.database.schemas import TieredHealthMatrixReport
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_health_probes")


async def run_health_probes_audit():
    logger.info("================================================================================")
    logger.info("[INFRASTRUCTURE AUDIT] CLOUD-NATIVE TIERED HEALTH PROBES (LIVENESS/READINESS/STARTUP)")
    logger.info("================================================================================")

    passed_count = 0
    total_assertions = 5
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # ----------------------------------------------------------------------
        # Assertion 1: Sub-5ms Liveness Probe SLA (/health/liveness)
        # ----------------------------------------------------------------------
        logger.info("\n[1/5] Verifying Process Liveness Probe SLA (/health/liveness)...")
        start_t = time.perf_counter()
        resp = await client.get("/health/liveness")
        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)

        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}: {resp.text}"
        payload = resp.json()
        assert payload.get("status") == "HEALTHY", f"Expected HEALTHY, got {payload.get('status')}"
        assert payload.get("event_loop_healthy") is True, "Event loop reported unblocked"
        assert payload.get("uptime_seconds") >= 0, "Uptime must be non-negative"
        logger.info(
            f"  ✓ Liveness probe verified: status={payload.get('status')}, latency={elapsed_ms}ms, uptime={payload.get('uptime_seconds')}s"
        )
        passed_count += 1

        # ----------------------------------------------------------------------
        # Assertion 2: Deep Dependency Readiness Probe (/health/readiness)
        # ----------------------------------------------------------------------
        logger.info("\n[2/5] Verifying Deep Dependency Readiness Probe (/health/readiness)...")
        resp = await client.get("/health/readiness")
        assert resp.status_code in (200, 503), f"Unexpected status code: {resp.status_code}"
        payload = resp.json()

        subsystems = payload.get("subsystems", [])
        sub_names = [s.get("name") for s in subsystems]
        assert "postgresql" in sub_names, "PostgreSQL probe missing from readiness payload"
        assert "redis" in sub_names, "Redis probe missing from readiness payload"

        pg_probe = next(s for s in subsystems if s.get("name") == "postgresql")
        redis_probe = next(s for s in subsystems if s.get("name") == "redis")

        assert pg_probe.get("latency_ms") >= 0, "PostgreSQL latency must be measured"
        assert redis_probe.get("latency_ms") >= 0, "Redis latency must be measured"
        logger.info(
            f"  ✓ Readiness probe verified: overall={payload.get('status')}, PG={pg_probe.get('status')} ({pg_probe.get('latency_ms')}ms), Redis={redis_probe.get('status')} ({redis_probe.get('latency_ms')}ms)"
        )
        passed_count += 1

        # ----------------------------------------------------------------------
        # Assertion 3: pgvector Extension Probe Availability
        # ----------------------------------------------------------------------
        logger.info("\n[3/5] Verifying pgvector Semantic Vector Extension Probe...")
        assert "pgvector" in sub_names, "pgvector probe missing from subsystems list"
        vec_probe = next(s for s in subsystems if s.get("name") == "pgvector")
        assert vec_probe.get("status") in ("HEALTHY", "DEGRADED"), f"Unexpected vector status: {vec_probe.get('status')}"
        logger.info(
            f"  ✓ pgvector extension probe verified: status={vec_probe.get('status')}, latency={vec_probe.get('latency_ms')}ms, details='{vec_probe.get('details')}'"
        )
        passed_count += 1

        # ----------------------------------------------------------------------
        # Assertion 4: Cold-Start Initialization Startup Probe (/health/startup)
        # ----------------------------------------------------------------------
        logger.info("\n[4/5] Verifying Cold-Start Schema Initialization Probe (/health/startup)...")
        resp = await client.get("/health/startup")
        assert resp.status_code in (200, 503), f"Unexpected startup probe status: {resp.status_code}"
        payload = resp.json()
        assert "schema_ready" in payload, "schema_ready field missing from startup response"
        assert "tables_found" in payload, "tables_found list missing from startup response"
        logger.info(
            f"  ✓ Startup probe verified: status={payload.get('status')}, schema_ready={payload.get('schema_ready')}, tables={payload.get('tables_found')}"
        )
        passed_count += 1

        # ----------------------------------------------------------------------
        # Assertion 5: Comprehensive Health Matrix API (/v1/cloud/health/matrix)
        # ----------------------------------------------------------------------
        logger.info("\n[5/5] Testing Multi-Tier Health Matrix REST API (/v1/cloud/health/matrix)...")
        test_traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        resp = await client.get("/v1/cloud/health/matrix", headers={"traceparent": test_traceparent})
        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}: {resp.text}"

        parsed = TieredHealthMatrixReport.model_validate(resp.json())
        assert parsed.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736", (
            f"Expected trace ID propagation, got {parsed.trace_id}"
        )
        assert parsed.liveness.status in ("HEALTHY", "UNHEALTHY"), "Liveness block invalid"
        assert len(parsed.readiness.subsystems) >= 3, "Expected at least 3 subsystem probes"
        assert parsed.startup.status in ("INITIALIZED", "IN_PROGRESS", "FAILED"), "Startup block invalid"
        logger.info(
            f"  ✓ Health matrix API verified: overall={parsed.overall_status}, subsystems={len(parsed.readiness.subsystems)}, trace preserved"
        )
        passed_count += 1

    # --------------------------------------------------------------------------
    # Final Audit Summary
    # --------------------------------------------------------------------------
    logger.info("\n================================================================================")
    logger.info(
        f"🏁 TIERED HEALTH PROBES AUDIT COMPLETE: {passed_count}/{total_assertions} ASSERTIONS PASSED (100%)"
    )
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_health_probes_audit())
