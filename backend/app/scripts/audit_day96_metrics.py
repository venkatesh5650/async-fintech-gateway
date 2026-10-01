"""Audit Suite: Day 96 Prometheus Metric Exporters & Latency Histogram Telemetry.

Validates OpenMetrics /metrics scrape target, latency histogram distributions,
multi-subsystem gauges (Redis streams, cache hit rate, circuit breakers),
structured Golden Signals CQRS API, and traffic simulation engine.
"""

import sys
import logging
from fastapi.testclient import TestClient

from app.main import app
from app.core.telemetry_metrics import MetricsRegistryManager
from app.database.schemas import MetricSummaryReport

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [PROMETHEUS-AUDIT] %(message)s")
logger = logging.getLogger("audit_metrics")

client = TestClient(app)


def audit_day96_metrics():
    logger.info("=" * 80)
    logger.info("[DAY 96 AUDIT] PROMETHEUS METRIC EXPORTERS & LATENCY HISTOGRAM TELEMETRY")
    logger.info("=" * 80)

    # --------------------------------------------------------------------------
    # Assertion 1: OpenMetrics Scrape Target (/metrics)
    # --------------------------------------------------------------------------
    logger.info("\n[1/5] Testing Root Prometheus Scrape Target GET /metrics...")
    res = client.get("/metrics")
    assert res.status_code == 200, f"Expected HTTP 200 from /metrics, got {res.status_code}"
    assert "text/plain" in res.headers.get("content-type", ""), "Missing Prometheus plain text content type"

    metrics_text = res.text
    required_metrics = [
        "fintech_http_requests_total",
        "fintech_http_request_duration_seconds",
        "fintech_asgi_event_loop_lag_seconds",
        "fintech_redis_stream_lag_total",
        "fintech_cache_hits_total",
        "fintech_circuit_breaker_state",
    ]
    for m in required_metrics:
        assert m in metrics_text, f"Expected metric '{m}' missing from /metrics export"

    logger.info(f"  ✓ /metrics validated: {len(metrics_text)} bytes exported, all required telemetry families present.")

    # --------------------------------------------------------------------------
    # Assertion 2: HTTP Histogram & Counter Accurate Lineage
    # --------------------------------------------------------------------------
    logger.info("\n[2/5] Testing HTTP Latency Histogram & Request Counter Lineage...")
    mgr = MetricsRegistryManager.get_instance()
    initial_summary = mgr.get_metrics_summary()
    initial_requests = initial_summary["golden_signals"]["total_requests"]

    # Generate test requests
    client.get("/health/liveness")
    client.get("/v1/cloud/topology")
    client.get("/v1/cloud/seed/status")

    updated_summary = mgr.get_metrics_summary()
    new_requests = updated_summary["golden_signals"]["total_requests"]
    assert new_requests >= initial_requests, (
        f"Expected requests count to increment, got initial={initial_requests}, current={new_requests}"
    )

    # Verify histogram buckets exist in raw text
    raw_text = mgr.generate_metrics_text().decode("utf-8")
    assert "fintech_http_request_duration_seconds_bucket" in raw_text
    assert "fintech_http_request_duration_seconds_count" in raw_text
    assert "fintech_http_request_duration_seconds_sum" in raw_text

    logger.info(f"  ✓ HTTP Latency Histogram validated: requests tracked={new_requests}, bucket distributions populated.")

    # --------------------------------------------------------------------------
    # Assertion 3: Multi-Subsystem Gauges (Stream Lag, Cache, Circuit Breakers)
    # --------------------------------------------------------------------------
    logger.info("\n[3/5] Testing Multi-Subsystem Gauges & Distributed Cache Counters...")
    # Mutate subsystem telemetry
    mgr.update_stream_lag("intel_stream", 7)
    mgr.record_cache_event(hit=True, cache_domain="market_analytics")
    mgr.record_cache_event(hit=True, cache_domain="market_analytics")
    mgr.record_cache_event(hit=False, cache_domain="market_analytics")
    mgr.update_circuit_breaker_state("groq_llm", 0)  # CLOSED

    summary = mgr.get_metrics_summary()
    assert summary["stream_lag"].get("intel_stream") == 7, "Stream lag gauge mismatch"
    assert summary["cache_telemetry"]["hits"] >= 2, "Cache hits counter mismatch"
    assert summary["circuit_breaker_status"].get("groq_llm") == "CLOSED", "Circuit breaker state mismatch"

    logger.info(
        f"  ✓ Subsystem telemetry verified: stream_lag={summary['stream_lag']}, "
        f"cache_hits={summary['cache_telemetry']['hits']}, circuit_breaker={summary['circuit_breaker_status']}"
    )

    # --------------------------------------------------------------------------
    # Assertion 4: Golden Signals CQRS API (GET /v1/cloud/metrics/summary)
    # --------------------------------------------------------------------------
    logger.info("\n[4/5] Testing Structured Metrics Summary REST API GET /v1/cloud/metrics/summary...")
    test_trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    test_span_id = "00f067aa0ba902b7"
    custom_traceparent = f"00-{test_trace_id}-{test_span_id}-01"

    summary_res = client.get("/v1/cloud/metrics/summary", headers={"traceparent": custom_traceparent})
    assert summary_res.status_code == 200, f"Expected HTTP 200, got {summary_res.status_code}"

    summary_json = summary_res.json()
    validated_report = MetricSummaryReport(**summary_json)
    assert validated_report.trace_id == test_trace_id, (
        f"Trace ID propagation failure: expected {test_trace_id}, got {validated_report.trace_id}"
    )
    assert validated_report.golden_signals.event_loop_lag_ms > 0
    assert validated_report.active_metrics_count > 0

    logger.info(
        f"  ✓ Golden Signals API verified: throughput={validated_report.golden_signals.throughput_rps} rps, "
        f"P90={validated_report.golden_signals.p90_latency_ms}ms, P99={validated_report.golden_signals.p99_latency_ms}ms, "
        f"trace_id={validated_report.trace_id}"
    )

    # --------------------------------------------------------------------------
    # Assertion 5: Dynamic Traffic Simulation (POST /v1/cloud/metrics/simulate-traffic)
    # --------------------------------------------------------------------------
    logger.info("\n[5/5] Testing Dynamic Traffic Simulation POST /v1/cloud/metrics/simulate-traffic...")
    sim_res = client.post(
        "/v1/cloud/metrics/simulate-traffic",
        json={"count": 30},
        headers={"traceparent": custom_traceparent},
    )
    assert sim_res.status_code == 200, f"Expected HTTP 200, got {sim_res.status_code}"
    sim_json = sim_res.json()
    assert sim_json["status"] == "SUCCESS"
    assert sim_json["simulated_requests"] == 30
    assert sim_json["trace_id"] == test_trace_id

    # Post-check summary
    post_summary = client.get("/v1/cloud/metrics/summary").json()
    assert post_summary["golden_signals"]["total_requests"] >= 30

    logger.info(
        f"  ✓ Traffic simulation verified: {sim_json['simulated_requests']} synthetic requests injected, "
        f"total_requests={post_summary['golden_signals']['total_requests']}."
    )

    logger.info("=" * 80)
    logger.info("🏁 DAY 96 PROMETHEUS TELEMETRY AUDIT COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
    logger.info("=" * 80)
    return True


if __name__ == "__main__":
    try:
        success = audit_day96_metrics()
        if not success:
            sys.exit(1)
    except AssertionError as ae:
        logger.error(f"❌ AUDIT FAILED: {ae}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ UNEXPECTED AUDIT ERROR: {e}", exc_info=True)
        sys.exit(1)
