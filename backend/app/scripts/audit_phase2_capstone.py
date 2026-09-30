import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
from httpx import ASGITransport
from app.core.capstone_report import capstone_registry
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_phase2_capstone")


async def run_phase2_capstone_audit():
    logger.info("================================================================================")
    logger.info("[DAY 90 AUDIT] PHASE 2 CAPSTONE CERTIFICATION & PRODUCTION SIGN-OFF AUDIT")
    logger.info("================================================================================")

    report = capstone_registry.get_capstone_report()

    # 1. Capstone Report Metadata & Version Verification
    assert report.version == "v0.9.0", f"Expected version v0.9.0, got {report.version}"
    assert report.status == "SEALED", f"Expected status SEALED, got {report.status}"
    assert report.pass_rate_pct == 100.0, f"Expected 100.0% pass rate, got {report.pass_rate_pct}%"
    logger.info(
        f"[PASS] Assertion 1: Capstone release version verified ({report.version} | Status: {report.status} | Pass Rate: {report.pass_rate_pct}%)."
    )

    # 2. Milestone Completeness & Assertion Aggregation
    assert report.total_milestones == 6, f"Expected 6 milestones, got {report.total_milestones}"
    assert report.milestones_sealed == 6, f"Expected 6 sealed milestones, got {report.milestones_sealed}"
    assert report.total_assertions >= 45, f"Expected >= 45 assertions, got {report.total_assertions}"
    assert report.assertions_passed == report.total_assertions

    milestone_ids = {m.milestone_id for m in report.milestones}
    expected_ids = {"M1", "M2", "M3", "M4", "M5", "CAPSTONE"}
    assert expected_ids.issubset(milestone_ids), f"Missing milestones: {expected_ids - milestone_ids}"
    logger.info(
        f"[PASS] Assertion 2: All 6 Phase 2 milestones verified ({report.assertions_passed}/{report.total_assertions} assertions sealed 100%)."
    )

    # 3. Core Infrastructure Telemetry Health
    assert report.stream_health_status == "ACTIVE"
    assert report.circuit_breaker_state == "CLOSED"
    assert report.cache_layer_status == "OPERATIONAL"
    assert report.rag_embeddings_status == "OPERATIONAL"
    logger.info(
        f"[PASS] Assertion 3: Subsystem states verified (Streams={report.stream_health_status}, Circuit={report.circuit_breaker_state}, Cache={report.cache_layer_status}, RAG={report.rag_embeddings_status})."
    )

    # 4. Codebase Scale & Module Footprint
    assert report.lines_of_code >= 10000, f"Expected >= 10,000 LOC, counted {report.lines_of_code}"
    assert report.python_modules_count >= 50, f"Expected >= 50 modules, counted {report.python_modules_count}"
    logger.info(
        f"[PASS] Assertion 4: Repository scale verified ({report.python_modules_count} modules, {report.lines_of_code} LOC)."
    )

    # 5. REST Microservice Endpoint Verification
    transport = ASGITransport(app=app)
    headers = {"X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026"}

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/v1/system/capstone-report", headers=headers)
        assert resp.status_code == 200, f"GET /v1/system/capstone-report failed: {resp.status_code}"
        data = resp.json()
        assert data["version"] == "v0.9.0"
        assert data["status"] == "SEALED"
        assert len(data["milestones"]) == 6

    logger.info(
        "[PASS] Assertion 5: Microservice endpoint GET /v1/system/capstone-report verified via HTTP ASGI transport."
    )

    logger.info("================================================================================")
    logger.info("[DAY 90 CERTIFIED] 5/5 PHASE 2 CAPSTONE ASSERTIONS PASSED (v0.9.0 SEALED)")
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_phase2_capstone_audit())
