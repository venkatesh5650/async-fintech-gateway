"""System Audit Suite: Live Production Ingress, Custom Domains & TLS/SSL Termination (SPEC-PRODUCTION-INGRESS).

Validates:
1. Production Nginx Reverse Proxy Configuration & TLS 1.3 Directives.
2. Declarative Ingress Spec Model, Certificate Details & OCSP Stapling.
3. Mandatory Zero-Trust HTTP Security Headers (HSTS, CSP, X-Frame-Options, nosniff).
4. Automated Ingress Security Verification Engine (A+ Grade Benchmark).
5. REST API Endpoints GET /v1/cloud/ingress/spec & POST /v1/cloud/ingress/verify.
"""

import sys
import logging
from fastapi.testclient import TestClient

from app.main import app
from app.core.production_ingress import ingress_config_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [INGRESS-AUDIT] %(message)s")
logger = logging.getLogger("audit_production_ingress")


def run_audit() -> bool:
    logger.info("=" * 80)
    logger.info("[SYSTEM AUDIT: SPEC-PRODUCTION-INGRESS] PRODUCTION INGRESS & TLS 1.3 TERMINATION")
    logger.info("=" * 80)

    client = TestClient(app)

    # [1/5] Production Nginx Reverse Proxy Configuration & TLS 1.3 Directives
    logger.info("\n[1/5] Testing Production Nginx Reverse Proxy Configuration & TLS 1.3 Directives...")
    spec = ingress_config_manager.get_ingress_spec()
    assert spec.raw_nginx_config is not None and len(spec.raw_nginx_config) > 200, "Nginx config missing or empty"
    assert "ssl_protocols TLSv1.3;" in spec.raw_nginx_config, "Nginx config missing strict TLSv1.3 directive"
    assert "fintech_fastapi_cluster" in spec.raw_nginx_config, "Nginx config missing FastAPI upstream cluster"
    assert "fintech_nextjs_cluster" in spec.raw_nginx_config, "Nginx config missing Next.js upstream cluster"
    logger.info(
        f"  ✓ Nginx configuration verified: controller={spec.ingress_controller}, upstream clusters verified, TLS 1.3 enforced."
    )

    # [2/5] Declarative Ingress Spec Model & Certificate Details
    logger.info("\n[2/5] Testing Ingress Spec Model & Certificate Metadata...")
    assert spec.ssl_grade == "A+", f"Unexpected SSL grade: {spec.ssl_grade}"
    assert spec.security_score == 100, f"Unexpected security score: {spec.security_score}"
    assert spec.certificate.domain == "*.fintech-gateway.live"
    assert spec.certificate.tls_version == "TLSv1.3"
    assert "Let's Encrypt" in spec.certificate.issuer
    assert spec.certificate.ocsp_stapling_enabled is True
    assert spec.certificate.days_until_expiry > 0
    logger.info(
        f"  ✓ Certificate metadata verified: domain={spec.certificate.domain}, issuer={spec.certificate.issuer}, cipher={spec.certificate.cipher_suite[:30]}..."
    )

    # [3/5] Mandatory Zero-Trust HTTP Security Headers
    logger.info("\n[3/5] Testing Mandatory Zero-Trust HTTP Security Headers...")
    required_header_names = {
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Content-Security-Policy",
        "Referrer-Policy",
        "Permissions-Policy",
    }
    configured_header_names = {h.header_name for h in spec.security_headers}
    assert required_header_names.issubset(configured_header_names), f"Missing headers: {required_header_names - configured_header_names}"

    hsts = next(h for h in spec.security_headers if h.header_name == "Strict-Transport-Security")
    assert "preload" in hsts.directive_value and "31536000" in hsts.directive_value
    xfo = next(h for h in spec.security_headers if h.header_name == "X-Frame-Options")
    assert xfo.directive_value == "DENY"
    logger.info(
        f"  ✓ Security headers verified: all {len(required_header_names)} mandatory headers active with strict directives."
    )

    # [4/5] Automated Ingress Security Verification Engine
    logger.info("\n[4/5] Testing Automated Ingress Verification Engine & Grade Benchmark...")
    verification = ingress_config_manager.verify_ingress_security()
    assert verification.status == "CERTIFIED", f"Verification status mismatch: {verification.status}"
    assert verification.ssl_grade == "A+", f"Security grade below benchmark: {verification.ssl_grade}"
    assert verification.overall_score == 100, f"Score mismatch: {verification.overall_score}"
    assert verification.checks_passed == 5, f"Expected 5 passing checks, got {verification.checks_passed}"
    for check in verification.checkpoints:
        assert check.status == "PASSED", f"Check {check.check_name} failed: {check.details}"
    logger.info(
        f"  ✓ Ingress verification engine verified: grade={verification.ssl_grade}, score={verification.overall_score}%, {verification.checks_passed}/{verification.checks_total} checkpoints passed."
    )

    # [5/5] REST API Endpoints GET /v1/cloud/ingress/spec & POST /v1/cloud/ingress/verify
    logger.info("\n[5/5] Testing REST API Endpoints /v1/cloud/ingress/spec & /verify...")
    spec_resp = client.get("/v1/cloud/ingress/spec")
    assert spec_resp.status_code == 200, f"Expected 200, got {spec_resp.status_code}: {spec_resp.text}"
    spec_data = spec_resp.json()
    assert spec_data["ssl_grade"] == "A+"
    assert spec_data["trace_id"] is not None

    verify_resp = client.post("/v1/cloud/ingress/verify")
    assert verify_resp.status_code == 200, f"Expected 200, got {verify_resp.status_code}: {verify_resp.text}"
    verify_data = verify_resp.json()
    assert verify_data["status"] == "CERTIFIED"
    assert verify_data["ssl_grade"] == "A+"
    assert verify_data["checks_passed"] == 5
    assert verify_data["trace_id"] is not None
    logger.info(
        f"  ✓ Ingress REST endpoints verified: spec retrieval and dynamic verification active with trace_id={verify_data['trace_id']}"
    )

    logger.info("=" * 80)
    logger.info("🏁 AUDIT SPEC-PRODUCTION-INGRESS COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
    logger.info("=" * 80)
    return True


# Backward compatibility alias
audit_production_ingress = run_audit


if __name__ == "__main__":
    try:
        success = run_audit()
        if not success:
            sys.exit(1)
    except AssertionError as ae:
        logger.error(f"❌ AUDIT FAILED: {ae}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ UNEXPECTED AUDIT ERROR: {e}", exc_info=True)
        sys.exit(1)
