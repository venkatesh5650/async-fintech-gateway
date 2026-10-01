"""System Audit Suite: Phase 3 Capstone Seal & Production Go-Live Certification (SPEC-PHASE3-CAPSTONE).

Validates:
1. 10-Point Production Verification Checklist (10/10 Certified, 100% Score).
2. End-to-End Multi-Service Synthetic Smoke Test (8/8 Microservice Steps Success).
3. Cryptographically Signed Go-Live Certificate & SHA-256 Signature Hash.
4. REST API Endpoints GET /v1/cloud/capstone/readiness & POST /v1/cloud/capstone/smoke-test.
5. REST API Endpoint GET /v1/cloud/capstone/certificate & v1.0.0-rc1 Seal.
"""

import sys
import logging
from fastapi.testclient import TestClient

from app.main import app
from app.core.go_live_certifier import go_live_certifier

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [CAPSTONE-AUDIT] %(message)s")
logger = logging.getLogger("audit_phase3_capstone")


def run_audit() -> bool:
    logger.info("=" * 80)
    logger.info("[SYSTEM AUDIT: SPEC-PHASE3-CAPSTONE] PRODUCTION GO-LIVE CERTIFICATION")
    logger.info("=" * 80)

    client = TestClient(app)

    # [1/5] 10-Point Production Verification Checklist
    logger.info("\n[1/5] Testing 10-Point Production Verification Checklist...")
    report = go_live_certifier.get_readiness_report()
    assert report.status == "CERTIFIED_FOR_PRODUCTION", f"Expected CERTIFIED_FOR_PRODUCTION, got {report.status}"
    assert report.readiness_score == 100, f"Expected 100% score, got {report.readiness_score}"
    assert report.checks_passed == 10, f"Expected 10 passing checks, got {report.checks_passed}"
    assert len(report.criteria) == 10, f"Expected 10 checklist criteria, got {len(report.criteria)}"
    for item in report.criteria:
        assert item.status == "CERTIFIED", f"Checklist item not certified: {item.criterion_name}"
    logger.info(
        f"  ✓ 10-Point Checklist verified: score={report.readiness_score}%, all 10 criteria passed (version={report.version})."
    )

    # [2/5] End-to-End Multi-Service Synthetic Smoke Test
    logger.info("\n[2/5] Testing End-to-End Multi-Service Smoke Test Battery...")
    smoke_report = go_live_certifier.execute_smoke_test(ticker="AAPL")
    assert smoke_report.status == "SUCCESS", f"Unexpected status: {smoke_report.status}"
    assert smoke_report.steps_passed == 8, f"Expected 8 steps passed, got {smoke_report.steps_passed}"
    assert len(smoke_report.steps) == 8, f"Expected 8 smoke test steps, got {len(smoke_report.steps)}"
    for step in smoke_report.steps:
        assert step.status == "SUCCESS", f"Smoke test step failed: {step.name}"
        assert step.duration_ms > 0, f"Invalid duration for {step.name}: {step.duration_ms}"
    logger.info(
        f"  ✓ Smoke test battery verified: {smoke_report.steps_passed}/8 microservices operational, total_duration={smoke_report.total_duration_ms:.2f}ms."
    )

    # [3/5] Cryptographically Signed Go-Live Certificate & SHA-256 Hash
    logger.info("\n[3/5] Testing Cryptographic Go-Live Certificate Integrity...")
    cert = go_live_certifier.generate_certificate()
    assert cert.release_tag == "v1.0.0-rc1", f"Unexpected release version: {cert.release_tag}"
    assert "Architect" in cert.signed_by, f"Signatory mismatch: {cert.signed_by}"
    assert len(cert.signature_hash) == 64, f"Invalid SHA-256 length: {len(cert.signature_hash)}"
    assert cert.readiness_percentage == 100.0
    logger.info(
        f"  ✓ Go-Live certificate verified: version={cert.release_tag}, signature={cert.signature_hash[:16]}..., status={cert.status}."
    )

    # [4/5] REST API Endpoints GET /v1/cloud/capstone/readiness & POST /v1/cloud/capstone/smoke-test
    logger.info("\n[4/5] Testing REST Endpoints /capstone/readiness & /capstone/smoke-test...")
    readiness_res = client.get("/v1/cloud/capstone/readiness")
    assert readiness_res.status_code == 200, f"Expected 200, got {readiness_res.status_code}: {readiness_res.text}"
    r_data = readiness_res.json()
    assert r_data["status"] == "CERTIFIED_FOR_PRODUCTION"
    assert r_data["readiness_score"] == 100

    smoke_res = client.post("/v1/cloud/capstone/smoke-test")
    assert smoke_res.status_code == 200, f"Expected 200, got {smoke_res.status_code}: {smoke_res.text}"
    s_data = smoke_res.json()
    assert s_data["status"] == "SUCCESS"
    assert s_data["steps_passed"] == 8
    logger.info(
        f"  ✓ REST readiness & smoke endpoints verified: trace_id={s_data['trace_id']}, duration={s_data['total_duration_ms']}ms."
    )

    # [5/5] REST API Endpoint GET /v1/cloud/capstone/certificate & Seal Verification
    logger.info("\n[5/5] Testing REST Endpoint /v1/cloud/capstone/certificate & Release Seal...")
    cert_res = client.get("/v1/cloud/capstone/certificate")
    assert cert_res.status_code == 200, f"Expected 200, got {cert_res.status_code}: {cert_res.text}"
    c_data = cert_res.json()
    assert c_data["release_tag"] == "v1.0.0-rc1"
    assert c_data["readiness_percentage"] == 100.0
    assert len(c_data["signature_hash"]) == 64
    logger.info(
        f"  ✓ REST certificate endpoint verified: release_tag={c_data['release_tag']}, signed_by='{c_data['signed_by']}'."
    )

    logger.info("=" * 80)
    logger.info("🏁 AUDIT SPEC-PHASE3-CAPSTONE COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
    logger.info("=" * 80)
    return True


# Backward compatibility alias
audit_phase3_capstone = run_audit


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
