import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
from httpx import ASGITransport
from app.core.code_quality import code_quality_auditor
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_code_quality")


async def run_code_quality_audit():
    logger.info("================================================================================")
    logger.info("[SYSTEM AUDIT] ZERO-DEBT CODE QUALITY & AST SYNTAX VERIFICATION")
    logger.info("================================================================================")

    # 1. Execute Core CodeQualityAuditor
    report = await code_quality_auditor.run_audit()
    assert report.status == "PASSED", f"Quality scan expected PASSED, got: {report.status}"
    assert report.total_checks >= 4, f"Expected at least 4 checks, got {report.total_checks}"
    assert report.passed_checks == report.total_checks
    logger.info(
        f"✅ Assertion 1 Passed: Core quality scan executed successfully ({report.passed_checks}/{report.total_checks} checks passed)."
    )

    # 2. Verify Codebase Metric Footprint
    assert report.total_files_scanned >= 40, f"Expected >= 40 files, scanned {report.total_files_scanned}"
    assert report.total_lines_of_code >= 5000, f"Expected >= 5000 LOC, scanned {report.total_lines_of_code}"
    logger.info(
        f"✅ Assertion 2 Passed: Codebase metric verified ({report.total_files_scanned} files, {report.total_lines_of_code} LOC)."
    )

    # 3. Verify AST Syntax Integrity
    ast_check = next((c for c in report.checks if c.tool == "ast"), None)
    assert ast_check is not None, "AST check item must be present"
    assert ast_check.status == "PASSED", f"AST syntax validation failed: {ast_check.details}"
    assert ast_check.issues_found == 0
    logger.info("✅ Assertion 3 Passed: AST parser confirmed zero syntax errors across 100% of Python source files.")

    # 4. Verify Ruff Linter & Formatter Cleanliness
    assert report.linter_clean is True, "Ruff static analysis must be 100% clean"
    assert report.formatter_clean is True, "Ruff code formatter check must be 100% clean"
    assert report.total_issues == 0, f"Expected 0 issues, detected: {report.total_issues}"
    logger.info("✅ Assertion 4 Passed: Ruff static analyzer & formatter verified 0 errors across rules E, W, F.")

    # 5. Verify Gateway Microservice Endpoints
    transport = ASGITransport(app=app)
    headers = {"X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026"}

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # GET /v1/system/code-quality
        resp_get = await client.get("/v1/system/code-quality", headers=headers)
        assert resp_get.status_code == 200, f"GET /v1/system/code-quality failed: {resp_get.status_code}"
        data_get = resp_get.json()
        assert data_get["status"] == "PASSED"
        assert data_get["total_files_scanned"] >= 40

        # POST /v1/system/code-quality/scan
        resp_scan = await client.post("/v1/system/code-quality/scan", headers=headers)
        assert resp_scan.status_code == 200, f"POST /v1/system/code-quality/scan failed: {resp_scan.status_code}"
        data_scan = resp_scan.json()
        assert data_scan["run_id"].startswith("cq_")
        assert data_scan["linter_clean"] is True

    logger.info(
        "✅ Assertion 5 Passed: GET and POST /v1/system/code-quality endpoints verified via HTTP ASGI transport."
    )

    logger.info("================================================================================")
    logger.info("[QUALITY CERTIFIED] 5/5 CODE QUALITY & STATIC ANALYSIS ASSERTIONS PASSED (100% CLEAN)")
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_code_quality_audit())
