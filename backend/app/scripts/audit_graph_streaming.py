"""
System Specification Audit: SPEC-GRAPH-STREAMING
Multi-Agent Real-Time Event Streaming & LLM Token Telemetry Audit Suite.

Evaluates per-node token calculation, cost attribution ($0.59/$0.79 per 1M tokens),
aggregate token reporting, SSE stream event delivery ordering, and REST API contracts.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys

from fastapi.testclient import TestClient

from app.core.graph_topology import langgraph_topology_manager
from app.database.schemas import AgentTokenSummaryReport, GraphExecutionTraceResponse
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AUDIT_GRAPH_STREAMING")

client = TestClient(app)


def test_assertion_1_token_cost_calculation() -> None:
    logger.info("\n[1/5] Testing Per-Node LLM Token Cost Calculation & Pricing Models...")

    # Agent node (Llama 3.3 70B)
    agent_spec = langgraph_topology_manager._calculate_token_cost("agent", 1000)
    assert agent_spec.model_name == "llama-3.3-70b-versatile", f"Expected Llama model, got {agent_spec.model_name}"
    assert agent_spec.prompt_tokens == 720, f"Expected 720 prompt tokens, got {agent_spec.prompt_tokens}"
    assert agent_spec.completion_tokens == 280, f"Expected 280 completion tokens, got {agent_spec.completion_tokens}"
    assert agent_spec.total_tokens == 1000
    expected_agent_prompt_cost = round((720 / 1_000_000.0) * 0.59, 6)
    expected_agent_comp_cost = round((280 / 1_000_000.0) * 0.79, 6)
    expected_agent_total_cost = round(expected_agent_prompt_cost + expected_agent_comp_cost, 6)
    assert agent_spec.total_cost_usd == expected_agent_total_cost, (
        f"Expected {expected_agent_total_cost}, got {agent_spec.total_cost_usd}"
    )

    # Tools node (native code execution - $0 cost)
    tools_spec = langgraph_topology_manager._calculate_token_cost("tools", 200)
    assert tools_spec.model_name == "tool-executor-native"
    assert tools_spec.total_tokens == 200
    assert tools_spec.total_cost_usd == 0.0, f"Expected 0.0 cost for native tools, got {tools_spec.total_cost_usd}"

    # Reporting node
    rep_spec = langgraph_topology_manager._calculate_token_cost("reporting", 800)
    assert rep_spec.total_tokens == 800
    assert rep_spec.total_cost_usd > 0.0

    # Gatekeeper node
    gate_spec = langgraph_topology_manager._calculate_token_cost("gatekeeper", 100)
    assert gate_spec.total_tokens == 100
    assert gate_spec.total_cost_usd > 0.0

    logger.info("  ✓ Per-node token cost calculation verified across LLM reasoning, synthesis, gatekeeper, and native tools.")


def test_assertion_2_trace_token_aggregation() -> None:
    logger.info("\n[2/5] Testing Trace Total Token Aggregation & Cost Reconciliation...")
    trace = langgraph_topology_manager.simulate_execution(ticker="NVDA", scenario="TOOL_EXPEDITION")

    assert trace.steps_count == 5, f"Expected 5 steps for TOOL_EXPEDITION, got {trace.steps_count}"
    assert trace.total_tokens_consumed > 0, "Expected positive total tokens"
    assert trace.total_cost_usd > 0.0, "Expected positive total cost in USD"

    # Reconcile sum of steps
    step_tokens_sum = sum(step.tokens_estimated for step in trace.steps)
    step_cost_sum = round(sum(step.token_cost.total_cost_usd for step in trace.steps if step.token_cost), 6)

    assert trace.total_tokens_consumed == step_tokens_sum, (
        f"Token mismatch: trace={trace.total_tokens_consumed} vs steps={step_tokens_sum}"
    )
    assert trace.total_cost_usd == step_cost_sum, (
        f"Cost mismatch: trace={trace.total_cost_usd} vs steps={step_cost_sum}"
    )

    for step in trace.steps:
        assert step.token_cost is not None, f"Step {step.step_number} ({step.node_id}) missing token_cost spec"
        assert step.token_cost.total_tokens == step.tokens_estimated

    logger.info("  ✓ Trace token reconciliation verified: %d tokens, $%.6f USD across 5 steps.",
                trace.total_tokens_consumed, trace.total_cost_usd)


def test_assertion_3_token_summary_report() -> None:
    logger.info("\n[3/5] Testing Multi-Agent Token Summary Report & Node Allocation...")
    summary = langgraph_topology_manager.get_token_summary()

    assert isinstance(summary, AgentTokenSummaryReport)
    assert summary.total_runs_analyzed >= 4, f"Expected at least 4 runs, got {summary.total_runs_analyzed}"
    assert summary.total_tokens == summary.total_prompt_tokens + summary.total_completion_tokens
    assert summary.total_cost_usd > 0.0
    assert summary.avg_tokens_per_run > 0.0
    assert summary.avg_cost_per_run_usd > 0.0

    # Ensure all primary nodes have metrics
    for node_id in ["agent", "tools", "reporting", "gatekeeper"]:
        assert node_id in summary.by_node, f"Node {node_id} missing from token summary breakdown"
        node_spec = summary.by_node[node_id]
        assert node_spec.total_tokens >= 0

    assert "llama-3.3-70b-versatile" in summary.model_distribution

    logger.info("  ✓ Token summary verified: %d total tokens, $%.4f USD across %d analyzed runs.",
                summary.total_tokens, summary.total_cost_usd, summary.total_runs_analyzed)


def test_assertion_4_async_sse_streaming() -> None:
    logger.info("\n[4/5] Testing Asynchronous SSE Stream Event Delivery & Ordering...")

    async def _collect_stream() -> list[str]:
        chunks: list[str] = []
        async for chunk in langgraph_topology_manager.stream_execution_steps(
            ticker="AAPL", scenario="NOMINAL", delay_seconds=0.001
        ):
            chunks.append(chunk)
        return chunks

    events = asyncio.run(_collect_stream())
    assert len(events) >= 7, f"Expected at least 7 stream events, got {len(events)}"

    # Parse and verify event structure
    event_types: list[str] = []
    for chunk in events:
        lines = chunk.strip().split("\n")
        assert len(lines) >= 2, f"Malformed SSE chunk: {chunk}"
        event_line = lines[0]
        data_line = lines[1]
        assert event_line.startswith("event: "), f"Missing event prefix: {event_line}"
        assert data_line.startswith("data: "), f"Missing data prefix: {data_line}"

        e_type = event_line.replace("event: ", "").strip()
        event_types.append(e_type)

        data_payload = json.loads(data_line.replace("data: ", ""))
        assert "execution_id" in data_payload
        assert "node_id" in data_payload
        assert "step_number" in data_payload

    # First event must be step_start, final must be trace_complete
    assert event_types[0] == "step_start", f"First event was {event_types[0]}, expected step_start"
    assert event_types[-1] == "trace_complete", f"Last event was {event_types[-1]}, expected trace_complete"

    logger.info("  ✓ SSE stream generator verified: %d chronological event chunks delivered with strict structure.",
                len(events))


def test_assertion_5_rest_api_endpoints() -> None:
    logger.info("\n[5/5] Testing REST API Endpoints /v1/cloud/graph/tokens/summary & /graph/stream...")
    headers = {"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"}

    # 1. GET /v1/cloud/graph/tokens/summary
    res1 = client.get("/v1/cloud/graph/tokens/summary", headers=headers)
    assert res1.status_code == 200, f"Expected 200, got {res1.status_code}: {res1.text}"
    data1 = res1.json()
    summary = AgentTokenSummaryReport(**data1)
    assert summary.total_runs_analyzed > 0
    assert summary.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"

    # 2. GET /v1/cloud/graph/stream
    res2 = client.get("/v1/cloud/graph/stream?ticker=MSFT&scenario=NOMINAL&delay_ms=10", headers=headers)
    assert res2.status_code == 200, f"Expected 200, got {res2.status_code}: {res2.text}"
    assert "text/event-stream" in res2.headers.get("content-type", "")
    content = res2.text
    assert "event: step_start" in content
    assert "event: step_complete" in content
    assert "event: trace_complete" in content

    # 3. Verify simulate-step returns total_tokens_consumed and total_cost_usd
    res3 = client.post(
        "/v1/cloud/graph/simulate-step",
        json={"ticker": "TSLA", "scenario": "RETRY_LOOP"},
        headers=headers,
    )
    assert res3.status_code == 200, f"Expected 200, got {res3.status_code}: {res3.text}"
    trace = GraphExecutionTraceResponse(**res3.json())
    assert trace.total_tokens_consumed > 0
    assert trace.total_cost_usd > 0.0

    logger.info("  ✓ REST API verified: GET /graph/tokens/summary and GET /graph/stream active with W3C trace lineage.")


def main() -> None:
    logger.info("=" * 80)
    logger.info("[SYSTEM AUDIT: SPEC-GRAPH-STREAMING] REAL-TIME STREAMING & LLM TOKEN TELEMETRY")
    logger.info("=" * 80)

    try:
        test_assertion_1_token_cost_calculation()
        test_assertion_2_trace_token_aggregation()
        test_assertion_3_token_summary_report()
        test_assertion_4_async_sse_streaming()
        test_assertion_5_rest_api_endpoints()

        logger.info("=" * 80)
        logger.info("🏁 AUDIT SPEC-GRAPH-STREAMING COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
        logger.info("=" * 80)
        sys.exit(0)
    except AssertionError as err:
        logger.error("❌ AUDIT FAILED ON ASSERTION: %s", err)
        sys.exit(1)
    except Exception as exc:
        logger.exception("❌ AUDIT UNHANDLED EXCEPTION: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
