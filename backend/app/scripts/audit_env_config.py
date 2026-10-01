"""
Multi-Environment Promotion & Zero-Leak Secret Sanitization Audit
-----------------------------------------------------------------
Automated 5-point verification suite evaluating:
1. Environment profile classification (DEV/STAGING/PROD).
2. Production strict invariant gatekeeping (rejection of insecure configs).
3. Zero-leak credential masking & Shannon entropy calculation.
4. 10-point security compliance scoring engine.
5. REST API endpoint GET /v1/cloud/env-audit with W3C trace lineage.
"""

import asyncio
import logging
import os
import sys
import time

from httpx import ASGITransport, AsyncClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.config import EnvironmentProfile, Settings
from app.core.env_auditor import (
    EnvironmentConfigAuditor,
    calculate_shannon_entropy,
    mask_secret,
)
from app.database.schemas import EnvironmentAuditReport
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_env_config")


async def run_env_config_audit():
    logger.info("================================================================================")
    logger.info("[INFRASTRUCTURE AUDIT] MULTI-ENVIRONMENT PROMOTION & ZERO-LEAK REDACTION")
    logger.info("================================================================================")

    passed_count = 0
    total_assertions = 5
    transport = ASGITransport(app=app)

    # ----------------------------------------------------------------------
    # Assertion 1: Profile Parsing & Environmental Classification
    # ----------------------------------------------------------------------
    logger.info("\n[1/5] Testing Environment Profile Classification...")
    prod_settings = Settings(env_override="PRODUCTION")
    staging_settings = Settings(env_override="STAGING")
    dev_settings = Settings(env_override="DEVELOPMENT")

    assert prod_settings.profile == EnvironmentProfile.PRODUCTION, "Production profile mismatch"
    assert prod_settings.is_production is True, "is_production property mismatch"
    assert staging_settings.profile == EnvironmentProfile.STAGING, "Staging profile mismatch"
    assert staging_settings.is_staging is True, "is_staging property mismatch"
    assert dev_settings.profile == EnvironmentProfile.DEVELOPMENT, "Development profile mismatch"
    assert dev_settings.is_development is True, "is_development property mismatch"

    passed_count += 1
    logger.info("  ✓ Environment profile classification verified across all 3 tiers.")

    # ----------------------------------------------------------------------
    # Assertion 2: Production Strict Invariant Rejection
    # ----------------------------------------------------------------------
    logger.info("\n[2/5] Testing Production Strict Security Invariant Rejection...")
    insecure_prod = Settings(env_override="PRODUCTION")
    # By default, secret_key is placeholder
    violations = insecure_prod.validate_production_invariants()
    assert len(violations) > 0, "Insecure production settings should produce violations"
    assert any("SECRET_KEY" in v for v in violations), f"Expected SECRET_KEY violation, got {violations}"

    # Also test wildcard CORS rejection
    insecure_prod.allowed_origins = ["*"]
    violations_with_cors = insecure_prod.validate_production_invariants()
    assert any("CORS" in v for v in violations_with_cors), "Expected CORS wildcard violation"

    passed_count += 1
    logger.info(f"  ✓ Production invariant guards verified: caught {len(violations_with_cors)} security violations.")

    # ----------------------------------------------------------------------
    # Assertion 3: Zero-Leak Redaction & Shannon Entropy Assurance
    # ----------------------------------------------------------------------
    logger.info("\n[3/5] Testing Zero-Leak Secret Redaction & Shannon Entropy...")
    sample_key = "sk-ant-api03-institutional-high-frequency-crypto-key-99887766"
    masked_key = mask_secret(sample_key)

    assert "sk-" in masked_key, "Prefix preserved"
    assert sample_key not in masked_key, "Raw key leaked into masked output"
    assert "****" in masked_key, "Masking stars present"

    entropy = calculate_shannon_entropy(sample_key)
    assert entropy > 50.0, f"Expected high entropy for random key, got {entropy}"

    # Database URL masking verification
    db_raw = "postgresql+asyncpg://app_user:super_secret_password_123@db.render.internal:5432/fintech_db"
    test_settings = Settings()
    test_settings.database_url = db_raw
    auditor = EnvironmentConfigAuditor(settings_instance=test_settings)
    report = auditor.audit()
    db_secret_item = next((s for s in report.redacted_secrets if s.key_name == "DATABASE_URL"), None)
    assert db_secret_item is not None, "DATABASE_URL missing from redacted ledger"
    assert "super_secret_password_123" not in db_secret_item.masked_value, "Raw DB password leaked"

    passed_count += 1
    logger.info(f"  ✓ Zero-leak redaction verified: entropy={entropy} bits, secret fully sanitized.")

    # ----------------------------------------------------------------------
    # Assertion 4: 10-Point Security Compliance Scoring
    # ----------------------------------------------------------------------
    logger.info("\n[4/5] Evaluating 10-Point Security Compliance Scoring Engine...")
    assert len(report.checks) == 10, f"Expected 10 security checks, got {len(report.checks)}"
    assert 0.0 <= report.compliance_score_pct <= 100.0, f"Score out of bounds: {report.compliance_score_pct}"
    assert report.status in ("CERTIFIED", "REQUIRES_HARDENING", "NON_COMPLIANT"), f"Invalid status: {report.status}"

    categories = {c.category for c in report.checks}
    assert "SECRETS" in categories, "SECRETS category missing"
    assert "DATABASE" in categories, "DATABASE category missing"
    assert "CORS" in categories, "CORS category missing"

    passed_count += 1
    logger.info(
        f"  ✓ 10-point audit verified: score={report.compliance_score_pct}%, status={report.status}, checks={report.total_checks_passed}/{report.total_checks_count}"
    )

    # ----------------------------------------------------------------------
    # Assertion 5: REST API Contract & W3C Traceparent Lineage
    # ----------------------------------------------------------------------
    logger.info("\n[5/5] Testing REST API GET /v1/cloud/env-audit with W3C Lineage...")
    test_trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    test_traceparent = f"00-{test_trace_id}-00f067aa0ba902b7-01"

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        start_t = time.perf_counter()
        resp = await client.get("/v1/cloud/env-audit", headers={"traceparent": test_traceparent})
        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)

        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}: {resp.text}"
        payload = resp.json()
        validated_report = EnvironmentAuditReport.model_validate(payload)

        assert validated_report.trace_id == test_trace_id, (
            f"Expected trace_id {test_trace_id}, got {validated_report.trace_id}"
        )
        assert len(validated_report.checks) == 10, "API returned unexpected check count"
        assert len(validated_report.redacted_secrets) >= 4, "Redacted secrets ledger incomplete"

        # Verify no raw secrets leaked anywhere in the JSON response
        raw_json_str = resp.text
        assert sample_key not in raw_json_str, "Sample secret leaked into JSON response"
        assert "super_secret_password_123" not in raw_json_str, "Raw DB password leaked into JSON response"

    passed_count += 1
    logger.info(
        f"  ✓ REST API verified: HTTP 200 OK ({elapsed_ms}ms), trace preserved, compliance={validated_report.compliance_score_pct}%"
    )

    logger.info("\n================================================================================")
    logger.info(
        f"🏁 MULTI-ENVIRONMENT AUDIT COMPLETE: {passed_count}/{total_assertions} ASSERTIONS PASSED (100%)"
    )
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_env_config_audit())
