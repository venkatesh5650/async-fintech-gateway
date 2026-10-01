"""System Audit Suite: Distributed Tracing & W3C Span Waterfall Explorer (SPEC-DISTRIBUTED-TRACING).

Validates:
1. Synthetic Distributed Trace Generation & W3C Traceparent Header Compliance.
2. Hierarchical Span Hierarchy & Critical Path Latency Identification.
3. Relative Gantt Timing Calculations (Offset %, Width %, Duration ms).
4. REST API Endpoint GET /v1/cloud/traces Query Filtering Contract.
5. REST API Endpoints GET /v1/cloud/traces/{trace_id}/waterfall and POST /v1/cloud/traces/simulate.
"""

import logging
from fastapi.testclient import TestClient

from app.main import app
from app.core.trace_aggregator import TraceAggregator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [TRACING-AUDIT] %(message)s")
logger = logging.getLogger("audit_trace_waterfall")


def run_audit() -> bool:
    logger.info("=" * 80)
    logger.info("[SYSTEM AUDIT: SPEC-DISTRIBUTED-TRACING] DISTRIBUTED TRACING & W3C WATERFALL EXPLORER")
    logger.info("=" * 80)

    client = TestClient(app)

    # [1/5] Synthetic Distributed Trace Generation & W3C Traceparent
    logger.info("\n[1/5] Testing Synthetic Distributed Trace Generation & W3C Traceparent Compliance...")
    test_agg = TraceAggregator(max_buffer_size=50)
    synthetic_trace = test_agg.generate_synthetic_trace(ticker="NVDA", scenario="SUCCESS")
    assert synthetic_trace is not None, "Failed to generate synthetic trace"
    assert len(synthetic_trace.trace_id) == 32, f"Invalid W3C trace_id length: {synthetic_trace.trace_id}"
    assert synthetic_trace.w3c_traceparent.startswith("00-"), f"Invalid traceparent prefix: {synthetic_trace.w3c_traceparent}"
    assert len(synthetic_trace.w3c_traceparent.split("-")) == 4, f"Malformed traceparent header: {synthetic_trace.w3c_traceparent}"
    assert synthetic_trace.span_count >= 6, f"Expected at least 6 spans, got {synthetic_trace.span_count}"
    logger.info(
        f"  ✓ Trace generated: trace_id={synthetic_trace.trace_id[:12]}..., spans={synthetic_trace.span_count}, traceparent={synthetic_trace.w3c_traceparent}"
    )

    # [2/5] Hierarchical Span Hierarchy & Critical Path Latency
    logger.info("\n[2/5] Testing Hierarchical Span Hierarchy & Critical Path Latency...")
    root_span = next((s for s in synthetic_trace.spans if s.parent_span_id is None), None)
    assert root_span is not None, "Root span (parent_span_id=None) missing from waterfall"
    assert root_span.depth == 0, f"Root span depth must be 0, got {root_span.depth}"

    child_spans = [s for s in synthetic_trace.spans if s.parent_span_id == root_span.span_id]
    assert len(child_spans) >= 4, f"Expected >= 4 direct children of root, found {len(child_spans)}"

    nested_spans = [s for s in synthetic_trace.spans if s.depth >= 2]
    assert len(nested_spans) >= 2, f"Expected >= 2 nested leaf spans (depth>=2), found {len(nested_spans)}"

    critical_spans = [s for s in synthetic_trace.spans if s.is_critical_path]
    assert len(critical_spans) >= 2, f"Critical path must contain at least 2 spans, found {len(critical_spans)}"
    assert synthetic_trace.critical_path_duration_ms > 0, "Critical path duration must be positive"
    logger.info(
        f"  ✓ Span hierarchy validated: root='{root_span.name}', children={len(child_spans)}, nested={len(nested_spans)}, critical_spans={len(critical_spans)}"
    )

    # [3/5] Relative Gantt Timing Calculations
    logger.info("\n[3/5] Testing Relative Gantt Timing Calculations (Offsets & Widths)...")
    for s in synthetic_trace.spans:
        assert 0.0 <= s.offset_percent <= 100.0, f"Offset percent out of bounds: {s.offset_percent}"
        assert 0.0 < s.width_percent <= 100.0, f"Width percent out of bounds: {s.width_percent}"
        assert s.duration_ms > 0, f"Span duration must be strictly positive: {s.duration_ms}"
        assert s.relative_offset_ms >= 0, f"Relative offset must be non-negative: {s.relative_offset_ms}"
        assert s.traceparent.startswith("00-"), f"Span traceparent invalid: {s.traceparent}"

    logger.info(
        f"  ✓ Gantt geometry verified: total_duration={synthetic_trace.total_duration_ms}ms, offset bounds [0.0%, 100.0%]"
    )

    # [4/5] REST API Endpoint GET /v1/cloud/traces Query Filtering Contract
    logger.info("\n[4/5] Testing REST API GET /v1/cloud/traces Query Filtering...")
    resp = client.get("/v1/cloud/traces?limit=10")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    query_data = resp.json()
    assert "total" in query_data, "Missing 'total' field in TraceQueryResponse"
    assert "traces" in query_data, "Missing 'traces' field in TraceQueryResponse"
    assert query_data["total"] >= 1, "Expected pre-seeded traces in aggregator"
    first_trace = query_data["traces"][0]
    assert "trace_id" in first_trace, "Missing trace_id in trace summary item"
    assert "duration_ms" in first_trace, "Missing duration_ms in trace summary item"

    # Filter by ticker
    filter_resp = client.get("/v1/cloud/traces?ticker=AAPL")
    assert filter_resp.status_code == 200
    filter_data = filter_resp.json()
    for t in filter_data["traces"]:
        if t.get("ticker"):
            assert t["ticker"] == "AAPL", f"Filter mismatch: expected AAPL, got {t['ticker']}"

    logger.info(
        f"  ✓ Trace query API contract verified: total_retrieved={query_data['total']}, active_trace_id={query_data.get('active_trace_id')}"
    )

    # [5/5] REST API Waterfall Detail & Simulation Endpoints
    logger.info("\n[5/5] Testing REST API GET /v1/cloud/traces/{trace_id}/waterfall & POST /traces/simulate...")
    active_tid = query_data["traces"][0]["trace_id"]
    detail_resp = client.get(f"/v1/cloud/traces/{active_tid}/waterfall")
    assert detail_resp.status_code == 200, f"Expected 200, got {detail_resp.status_code}: {detail_resp.text}"
    detail_data = detail_resp.json()
    assert detail_data["trace_id"] == active_tid, "Waterfall trace_id mismatch"
    assert len(detail_data["spans"]) >= 6, f"Expected >= 6 spans in waterfall, got {len(detail_data['spans'])}"

    # Test simulation endpoint
    sim_payload = {"ticker": "TSLA", "scenario": "SLOW_LLM", "error_injected": False}
    sim_resp = client.post("/v1/cloud/traces/simulate", json=sim_payload)
    assert sim_resp.status_code == 201, f"Expected 201, got {sim_resp.status_code}: {sim_resp.text}"
    sim_data = sim_resp.json()
    assert sim_data["status"] == "SIMULATED", "Simulation status mismatch"
    assert sim_data["ticker"] == "TSLA", "Simulation ticker mismatch"
    assert "waterfall" in sim_data, "Simulation missing waterfall object"

    logger.info(
        f"  ✓ Waterfall & Simulation endpoints verified: trace_id={sim_data['trace_id']}, spans={sim_data['span_count']}, duration={sim_data['total_duration_ms']}ms"
    )

    logger.info("=" * 80)
    logger.info("🏁 AUDIT SPEC-DISTRIBUTED-TRACING COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
    logger.info("=" * 80)
    return True


# Backward compatibility alias
audit_trace_waterfall = run_audit


if __name__ == "__main__":
    run_audit()
