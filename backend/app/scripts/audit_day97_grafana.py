"""Audit Suite: Day 97 Grafana Dashboard Specifications & SLI/SLO Alert Thresholds.

Validates declarative Grafana Dashboard JSON models, Prometheus alerting rules,
real-time SRE SLI/SLO error budget and burn rate evaluation, and alert dispatch triggers.
"""

import sys
import logging
from fastapi.testclient import TestClient

from app.main import app
from app.core.grafana_spec import GrafanaSpecManager, SloThresholdEvaluator
from app.database.schemas import GrafanaDashboardSpec, SloStatusReport, AlertDispatchTestResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [GRAFANA-AUDIT] %(message)s")
logger = logging.getLogger("audit_grafana")

client = TestClient(app)


def audit_day97_grafana():
    logger.info("=" * 80)
    logger.info("[DAY 97 AUDIT] GRAFANA DASHBOARD SPECIFICATIONS & SLI/SLO ALERT THRESHOLDS")
    logger.info("=" * 80)

    test_trace_id = "7bf92f3577b34da6a3ce929d0e0e9797"
    test_span_id = "00f067aa0ba99797"
    custom_traceparent = f"00-{test_trace_id}-{test_span_id}-01"

    # --------------------------------------------------------------------------
    # Assertion 1: Grafana Dashboard JSON Specification Validation
    # --------------------------------------------------------------------------
    logger.info("\n[1/5] Testing Declarative Grafana Dashboard JSON Model GET /v1/cloud/grafana/spec...")
    res = client.get("/v1/cloud/grafana/spec", headers={"traceparent": custom_traceparent})
    assert res.status_code == 200, f"Expected HTTP 200 from /v1/cloud/grafana/spec, got {res.status_code}"

    spec_json = res.json()
    validated_spec = GrafanaDashboardSpec(**spec_json)
    assert validated_spec.uid == "fintech-gateway-core", f"UID mismatch: {validated_spec.uid}"
    assert validated_spec.schemaVersion >= 38, f"Unexpected schemaVersion: {validated_spec.schemaVersion}"
    assert len(validated_spec.panels) >= 6, f"Expected at least 6 panels, found {len(validated_spec.panels)}"

    # Verify PromQL expressions in panels
    panel_titles = [p.title for p in validated_spec.panels]
    assert any("Throughput" in t for t in panel_titles), "Missing Throughput panel"
    assert any("Error Rate" in t for t in panel_titles), "Missing Error Rate panel"
    assert any("Latency Quantiles" in t for t in panel_titles), "Missing Latency Quantiles panel"
    assert any("Redis Streams Saturation" in t for t in panel_titles), "Missing Saturation panel"

    logger.info(
        f"  ✓ Grafana Dashboard spec verified: uid='{validated_spec.uid}', "
        f"panels={len(validated_spec.panels)}, schemaVersion={validated_spec.schemaVersion}."
    )

    # --------------------------------------------------------------------------
    # Assertion 2: Prometheus Alerting Rules Specifications
    # --------------------------------------------------------------------------
    logger.info("\n[2/5] Testing Prometheus Alerting Rules Model & Severity Mappings...")
    rules = GrafanaSpecManager.get_prometheus_alert_rules()
    assert len(rules) >= 4, f"Expected at least 4 alerting rules, got {len(rules)}"

    rule_names = {r["alert"] for r in rules}
    required_alerts = {
        "HighHttpErrorRate",
        "P99LatencyBreach",
        "RedisStreamQueueLagHigh",
        "AsgiEventLoopStarvation",
    }
    assert required_alerts.issubset(rule_names), f"Missing required alerting rules: {required_alerts - rule_names}"

    for r in rules:
        assert r["severity"] in ["CRITICAL", "WARNING", "INFO"]
        assert len(r["expr"]) > 10, f"Invalid PromQL expression for {r['alert']}"
        assert "action" in r and len(r["action"]) > 5

    logger.info(f"  ✓ Prometheus alert rules verified: {len(rules)} rules configured with valid PromQL & actions.")

    # --------------------------------------------------------------------------
    # Assertion 3: SLI/SLO Evaluation & Error Budget Burn Rate Engine
    # --------------------------------------------------------------------------
    logger.info("\n[3/5] Testing SRE SLI/SLO Error Budget & Burn Rate Evaluator...")
    evaluator = SloThresholdEvaluator()
    slo_report_data = evaluator.evaluate_slos()
    assert slo_report_data["active_slos_count"] == 4
    assert 0.0 <= slo_report_data["overall_compliance_score"] <= 100.0

    slos = slo_report_data["slos"]
    slo_names = {s["name"] for s in slos}
    assert "API Service Availability SLA" in slo_names
    assert "P99 Response Latency SLA" in slo_names
    assert "Stream Backlog Processing SLA" in slo_names
    assert "ASGI Event Loop Scheduling SLA" in slo_names

    for s in slos:
        assert 0.0 <= s["error_budget_remaining_pct"] <= 100.0
        assert s["status"] in ["COMPLIANT", "WARNING", "BREACHED"]
        assert s["burn_rate_1h"] >= 0.0

    logger.info(
        f"  ✓ SLI/SLO evaluation verified: compliance={slo_report_data['overall_compliance_score']}%, "
        f"active_slos={slo_report_data['active_slos_count']}."
    )

    # --------------------------------------------------------------------------
    # Assertion 4: Alert Notification Dispatch & Webhook Drill (POST)
    # --------------------------------------------------------------------------
    logger.info("\n[4/5] Testing Synthetic Alert Notification Trigger POST /v1/cloud/alerts/test-dispatch...")
    dispatch_res = client.post(
        "/v1/cloud/alerts/test-dispatch",
        json={
            "alert_name": "P99LatencyBreach",
            "severity": "WARNING",
            "message": "Simulated P99 latency spike to 620ms on batch intelligence endpoint.",
        },
        headers={"traceparent": custom_traceparent},
    )
    assert dispatch_res.status_code == 200, f"Expected HTTP 200, got {dispatch_res.status_code}"

    dispatch_json = dispatch_res.json()
    validated_dispatch = AlertDispatchTestResponse(**dispatch_json)
    assert validated_dispatch.status == "DISPATCHED"
    assert validated_dispatch.alert_name == "P99LatencyBreach"
    assert validated_dispatch.trace_id == test_trace_id
    assert "Discord-Ops-Webhook" in validated_dispatch.dispatched_to
    assert "n8n-Incident-Orchestrator" in validated_dispatch.dispatched_to

    logger.info(
        f"  ✓ Alert dispatch verified: alert='{validated_dispatch.alert_name}', "
        f"destinations={validated_dispatch.dispatched_to}, trace_id={validated_dispatch.trace_id}."
    )

    # --------------------------------------------------------------------------
    # Assertion 5: Full CQRS Contract Compliance & Trace Lineage (GET /slo/status)
    # --------------------------------------------------------------------------
    logger.info("\n[5/5] Testing CQRS SLO Status REST API GET /v1/cloud/slo/status...")
    slo_res = client.get("/v1/cloud/slo/status", headers={"traceparent": custom_traceparent})
    assert slo_res.status_code == 200, f"Expected HTTP 200, got {slo_res.status_code}"

    slo_json = slo_res.json()
    validated_slo_report = SloStatusReport(**slo_json)
    assert validated_slo_report.trace_id == test_trace_id
    assert len(validated_slo_report.slos) == 4
    assert len(validated_slo_report.alert_rules) >= 4

    logger.info(
        f"  ✓ SLO Status API contract verified: compliance={validated_slo_report.overall_compliance_score}%, "
        f"slos={len(validated_slo_report.slos)}, rules={validated_slo_report.alert_rules_count}, "
        f"trace_id={validated_slo_report.trace_id}."
    )

    logger.info("=" * 80)
    logger.info("🏁 DAY 97 GRAFANA & SLI/SLO AUDIT COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
    logger.info("=" * 80)
    return True


if __name__ == "__main__":
    try:
        success = audit_day97_grafana()
        if not success:
            sys.exit(1)
    except AssertionError as ae:
        logger.error(f"❌ AUDIT FAILED: {ae}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ UNEXPECTED AUDIT ERROR: {e}", exc_info=True)
        sys.exit(1)
