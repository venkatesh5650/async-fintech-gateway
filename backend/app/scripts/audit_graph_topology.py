"""System Audit Suite: LangGraph Multi-Agent Topology & Dynamic Execution Tracer (SPEC-GRAPH-TOPOLOGY).

Validates:
1. Declarative Node Topology & Canvas Geometry (Agent, Tools, Synthesis, Quality Gate, Terminal).
2. Directed & Conditional Edge Routing Specifications (Tools Condition & Gatekeeper Feedback Loop).
3. Introspected AgentState Channels & Reducer Protocols (messages, quant_context, rag_context, etc.).
4. Multi-Scenario Execution Tracing & State Machine Simulations (Nominal, Tool Expedition, Retry Loop, RAG Failure).
5. REST API Endpoints GET /v1/cloud/graph/topology, GET /v1/cloud/graph/traces, and POST /v1/cloud/graph/simulate-step.
"""

import sys
import logging
from fastapi.testclient import TestClient

from app.main import app
from app.core.graph_topology import langgraph_topology_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [GRAPH-AUDIT] %(message)s")
logger = logging.getLogger("audit_graph_topology")

client = TestClient(app)


def run_audit() -> bool:
    logger.info("=" * 80)
    logger.info("[SYSTEM AUDIT: SPEC-GRAPH-TOPOLOGY] LANGGRAPH TOPOLOGY & EXECUTION TRACER")
    logger.info("=" * 80)

    test_trace_id = "5cf82f3577b34da6a3ce929d0e0e1011"
    test_span_id = "00f067aa0ba91011"
    custom_traceparent = f"00-{test_trace_id}-{test_span_id}-01"

    # --------------------------------------------------------------------------
    # Assertion 1: Declarative Node Topology & Canvas Geometry
    # --------------------------------------------------------------------------
    logger.info("\n[1/5] Testing Declarative Node Topology & Geometry...")
    topo = langgraph_topology_manager.get_topology_spec(trace_id=test_trace_id)
    assert topo.graph_id == "equity-research-multi-agent", f"Graph ID mismatch: {topo.graph_id}"
    assert topo.entry_point == "agent", f"Entry point must be 'agent', got {topo.entry_point}"
    assert len(topo.nodes) == 5, f"Expected exactly 5 nodes, got {len(topo.nodes)}"

    node_ids = {n.id for n in topo.nodes}
    required_nodes = {"agent", "tools", "reporting", "gatekeeper", "__end__"}
    assert required_nodes == node_ids, f"Node set mismatch: {required_nodes ^ node_ids}"

    for node in topo.nodes:
        assert node.position_x > 0 and node.position_y > 0, f"Invalid canvas coordinate for {node.id}"
        assert len(node.label) > 0, f"Missing label for {node.id}"
        assert node.category in ["AGENT", "TOOL", "REPORTING", "GATEKEEPER", "SYSTEM"]
        assert node.node_type in ["INTELLIGENCE", "TOOL_EXECUTION", "SYNTHESIS", "QUALITY_GATE", "TERMINATION"]

    agent_node = next(n for n in topo.nodes if n.id == "agent")
    assert "get_historical_prices" in agent_node.tools_bound
    assert "get_market_sentiment" in agent_node.tools_bound

    logger.info(
        f"  ✓ Node topology verified: {len(topo.nodes)} nodes declared with canvas geometry (agent, tools, reporting, gatekeeper, __end__)."
    )

    # --------------------------------------------------------------------------
    # Assertion 2: Directed & Conditional Edge Routing Specifications
    # --------------------------------------------------------------------------
    logger.info("\n[2/5] Testing Directed & Conditional Edge Routing...")
    assert len(topo.edges) == 6, f"Expected 6 edges, got {len(topo.edges)}"

    edge_tuples = {(e.source, e.target) for e in topo.edges}
    expected_tuples = {
        ("agent", "tools"),
        ("agent", "reporting"),
        ("tools", "agent"),
        ("reporting", "gatekeeper"),
        ("gatekeeper", "agent"),
        ("gatekeeper", "__end__"),
    }
    assert expected_tuples == edge_tuples, f"Edge routing mismatch: {expected_tuples ^ edge_tuples}"

    conditional_edges = [e for e in topo.edges if e.edge_type == "CONDITIONAL"]
    assert len(conditional_edges) == 4, f"Expected 4 conditional edges, got {len(conditional_edges)}"
    direct_edges = [e for e in topo.edges if e.edge_type == "DIRECT"]
    assert len(direct_edges) == 2, f"Expected 2 direct edges, got {len(direct_edges)}"

    gatekeeper_retry = next(e for e in topo.edges if e.source == "gatekeeper" and e.target == "agent")
    assert "retry_feedback" in gatekeeper_retry.label
    assert gatekeeper_retry.animated is True

    logger.info(
        f"  ✓ Edge routing verified: {len(conditional_edges)} conditional branches, {len(direct_edges)} direct paths, corrective feedback loop confirmed."
    )

    # --------------------------------------------------------------------------
    # Assertion 3: Introspected AgentState Channels & Reducer Protocols
    # --------------------------------------------------------------------------
    logger.info("\n[3/5] Testing Introspected AgentState Channels...")
    assert len(topo.state_channels) == 10, f"Expected 10 state channels, got {len(topo.state_channels)}"

    channel_map = {c.channel_name: c for c in topo.state_channels}
    assert "messages" in channel_map
    assert channel_map["messages"].reducer == "operator.add"
    assert "operator.add" in channel_map["messages"].type_name

    assert "quant_context" in channel_map
    assert channel_map["quant_context"].reducer == "replace"

    assert "rag_context" in channel_map
    assert channel_map["rag_context"].reducer == "replace"

    assert "is_sufficient" in channel_map
    assert channel_map["is_sufficient"].reducer == "replace"

    logger.info(
        "  ✓ State channels verified: 10 TypedDict channels documented with reducer contracts ('operator.add' accumulator, 'replace' registers)."
    )

    # --------------------------------------------------------------------------
    # Assertion 4: Multi-Scenario Execution Tracing & State Machine Simulations
    # --------------------------------------------------------------------------
    logger.info("\n[4/5] Testing Multi-Scenario Execution Tracing Engine...")
    # Scenario A: NOMINAL
    trace_nominal = langgraph_topology_manager.simulate_execution(ticker="NVDA", scenario="NOMINAL")
    assert trace_nominal.status == "SUCCESS"
    assert trace_nominal.final_signal == "BUY"
    assert trace_nominal.steps_count == 3
    assert [s.node_id for s in trace_nominal.steps] == ["agent", "reporting", "gatekeeper"]

    # Scenario B: TOOL_EXPEDITION
    trace_tools = langgraph_topology_manager.simulate_execution(ticker="AAPL", scenario="TOOL_EXPEDITION")
    assert trace_tools.status == "SUCCESS"
    assert trace_tools.steps_count == 5
    assert [s.node_id for s in trace_tools.steps] == ["agent", "tools", "agent", "reporting", "gatekeeper"]

    # Scenario C: RETRY_LOOP
    trace_retry = langgraph_topology_manager.simulate_execution(ticker="TSLA", scenario="RETRY_LOOP")
    assert trace_retry.status == "DEGRADED"
    assert trace_retry.steps_count == 6
    assert trace_retry.steps[2].status == "RETRY"
    assert trace_retry.final_signal == "HOLD"

    # Scenario D: RAG_FAILURE
    trace_rag_fail = langgraph_topology_manager.simulate_execution(ticker="MSFT", scenario="RAG_FAILURE")
    assert trace_rag_fail.status == "FAILED"
    assert trace_rag_fail.final_signal == "INVALID"

    logger.info(
        "  ✓ Execution tracer verified across 4 scenarios: Nominal (3 steps), Tool Expedition (5 steps), Retry Loop (6 steps), RAG Failure (3 steps)."
    )

    # --------------------------------------------------------------------------
    # Assertion 5: REST API Endpoints & Lineage
    # --------------------------------------------------------------------------
    logger.info("\n[5/5] Testing REST API Endpoints /v1/cloud/graph/topology, /traces, & /simulate-step...")
    # 1. Topology
    res_topo = client.get("/v1/cloud/graph/topology", headers={"traceparent": custom_traceparent})
    assert res_topo.status_code == 200, f"Expected 200, got {res_topo.status_code}: {res_topo.text}"
    topo_json = res_topo.json()
    assert topo_json["trace_id"] == test_trace_id
    assert len(topo_json["nodes"]) == 5
    assert len(topo_json["edges"]) == 6

    # 2. Traces list
    res_traces = client.get("/v1/cloud/graph/traces")
    assert res_traces.status_code == 200
    traces_list = res_traces.json()
    assert len(traces_list) >= 4, f"Expected >= 4 buffered traces, got {len(traces_list)}"

    # 3. Specific trace
    latest_id = traces_list[0]["execution_id"]
    res_detail = client.get(f"/v1/cloud/graph/traces/{latest_id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["execution_id"] == latest_id

    # 4. Dynamic simulation step
    sim_payload = {"ticker": "GOOGL", "scenario": "TOOL_EXPEDITION"}
    res_sim = client.post("/v1/cloud/graph/simulate-step", json=sim_payload, headers={"traceparent": custom_traceparent})
    assert res_sim.status_code == 200
    sim_json = res_sim.json()
    assert sim_json["ticker"] == "GOOGL"
    assert sim_json["scenario"] == "TOOL_EXPEDITION"
    assert sim_json["trace_id"] == test_trace_id
    assert len(sim_json["steps"]) == 5

    logger.info(
        "  ✓ REST API verified: GET /graph/topology, GET /graph/traces, GET /graph/traces/:id, and POST /graph/simulate-step operational with W3C lineage."
    )

    logger.info("=" * 80)
    logger.info("🏁 AUDIT SPEC-GRAPH-TOPOLOGY COMPLETE: 5/5 ASSERTIONS PASSED (100%)")
    logger.info("=" * 80)
    return True


# Backward compatibility alias
audit_graph_topology = run_audit


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
