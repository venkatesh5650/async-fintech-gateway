"""
Container Build Specification & Cloud Hardening Audit Suite
-----------------------------------------------------------
Executes automated 5-point verification battery confirming multi-stage
Docker builds, non-root user enforcement, .dockerignore hygiene,
and programmatic REST API contract compliance.
"""

import asyncio
import logging
import os
import sys

from httpx import ASGITransport, AsyncClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.docker_spec import ContainerBuildDiagnosticsManager
from app.database.schemas import ContainerSpecReport
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_container_spec")


async def run_container_spec_audit():
    logger.info("================================================================================")
    logger.info("[INFRASTRUCTURE AUDIT] MULTI-STAGE CONTAINER BUILD SPECIFICATION")
    logger.info("================================================================================")

    passed_count = 0
    total_assertions = 5
    diagnostics = ContainerBuildDiagnosticsManager()

    # --------------------------------------------------------------------------
    # Assertion 1: Web API Gateway Container Specification (Dockerfile.api)
    # --------------------------------------------------------------------------
    logger.info("\n[1/5] Verifying Web API Gateway Multi-Stage Container (Dockerfile.api)...")
    api_spec = diagnostics.analyze_dockerfile("Dockerfile.api", "api_gateway")
    assert api_spec.is_multistage, "Dockerfile.api must enforce multi-stage build pattern"
    assert api_spec.is_non_root, "Dockerfile.api must declare an unprivileged non-root user"
    assert api_spec.user_name == "appuser", f"Expected user 'appuser', found '{api_spec.user_name}'"
    assert 8000 in api_spec.exposed_ports, "Dockerfile.api must expose port 8000"
    assert api_spec.healthcheck_defined, "Dockerfile.api must define container HEALTHCHECK probe"
    assert api_spec.security_score_pct >= 90.0, f"API container security score {api_spec.security_score_pct}% < 90%"
    logger.info(
        f"  ✓ API Gateway container verified: base={api_spec.base_image}, user={api_spec.user_name}, score={api_spec.security_score_pct}%"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 2: Background Stream Worker Container Specification (Dockerfile.worker)
    # --------------------------------------------------------------------------
    logger.info("\n[2/5] Verifying Headless Stream Worker Multi-Stage Container (Dockerfile.worker)...")
    worker_spec = diagnostics.analyze_dockerfile("Dockerfile.worker", "stream_worker")
    assert worker_spec.is_multistage, "Dockerfile.worker must enforce multi-stage build pattern"
    assert worker_spec.is_non_root, "Dockerfile.worker must declare an unprivileged non-root user"
    assert worker_spec.user_name == "appuser", f"Expected user 'appuser', found '{worker_spec.user_name}'"
    assert "app.workers.consumer" in worker_spec.entrypoint_cmd, (
        f"Worker entrypoint must invoke consumer daemon, got: {worker_spec.entrypoint_cmd}"
    )
    assert worker_spec.security_score_pct >= 90.0, (
        f"Worker container security score {worker_spec.security_score_pct}% < 90%"
    )
    logger.info(
        f"  ✓ Stream Worker container verified: entrypoint={worker_spec.entrypoint_cmd}, user={worker_spec.user_name}, score={worker_spec.security_score_pct}%"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 3: Container Exclusion Hygiene (.dockerignore)
    # --------------------------------------------------------------------------
    logger.info("\n[3/5] Verifying .dockerignore Security Hygiene & Asset Exclusion...")
    dockerignore_audit = diagnostics.audit_dockerignore()
    assert dockerignore_audit.is_valid, f"Dockerignore hygiene invalid. Missing: {dockerignore_audit.missing_exclusions}"
    assert len(dockerignore_audit.missing_exclusions) == 0, (
        f"Critical exclusions missing: {dockerignore_audit.missing_exclusions}"
    )
    assert dockerignore_audit.total_rules >= 10, (
        f"Expected at least 10 ignore rules, found {dockerignore_audit.total_rules}"
    )
    logger.info(
        f"  ✓ .dockerignore verified: {dockerignore_audit.total_rules} rules active, exclusions={dockerignore_audit.critical_exclusions_present}"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 4: ContainerBuildDiagnosticsManager Programmatic Report
    # --------------------------------------------------------------------------
    logger.info("\n[4/5] Evaluating Programmatic Diagnostic Report Generation...")
    report = diagnostics.generate_full_report()
    assert isinstance(report, ContainerSpecReport), "Report must conform to ContainerSpecReport schema"
    assert report.status == "CERTIFIED", f"Expected CERTIFIED status, got {report.status}"
    assert report.total_services == 2, f"Expected 2 services, got {report.total_services}"
    assert report.compliance_score_pct >= 90.0, f"Expected compliance >= 90%, got {report.compliance_score_pct}%"
    assert len(report.trace_id) == 32, f"Invalid W3C trace ID length: {report.trace_id}"
    logger.info(
        f"  ✓ Diagnostic report verified: status={report.status}, compliance={report.compliance_score_pct}%, trace_id={report.trace_id}"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 5: REST API Endpoint GET /v1/cloud/docker-spec Contract
    # --------------------------------------------------------------------------
    logger.info("\n[5/5] Testing REST API Endpoint GET /v1/cloud/docker-spec...")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        test_traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        response = await client.get("/v1/cloud/docker-spec", headers={"traceparent": test_traceparent})
        assert response.status_code == 200, f"Expected HTTP 200, received {response.status_code}: {response.text}"
        payload = response.json()

        # Validate with Pydantic
        parsed_report = ContainerSpecReport.model_validate(payload)
        assert parsed_report.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736", (
            f"Expected trace_id to match header, got {parsed_report.trace_id}"
        )
        assert len(parsed_report.services) == 2, "Expected 2 services in API response"
        assert parsed_report.status == "CERTIFIED", f"Expected CERTIFIED status, got {parsed_report.status}"
        logger.info(
            f"  ✓ REST API verified: HTTP 200 OK, trace context preserved, services={len(parsed_report.services)}"
        )
        passed_count += 1

    # --------------------------------------------------------------------------
    # Final Audit Summary
    # --------------------------------------------------------------------------
    logger.info("\n================================================================================")
    logger.info(
        f"🏁 CONTAINER SPECIFICATION AUDIT COMPLETE: {passed_count}/{total_assertions} ASSERTIONS PASSED (100%)"
    )
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_container_spec_audit())
