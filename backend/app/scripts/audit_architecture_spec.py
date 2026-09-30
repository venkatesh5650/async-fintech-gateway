import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
from httpx import ASGITransport
from app.core.architecture import SystemArchitectureRegistry
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_architecture_spec")


async def run_architecture_audit():
    logger.info("================================================================================")
    logger.info("[SYSTEM AUDIT] ARCHITECTURE SPECIFICATION & TOPOLOGY BLUEPRINT VERIFICATION")
    logger.info("================================================================================")

    # 1. Inspect In-Memory Registry
    topology = SystemArchitectureRegistry.get_topology()
    assert topology.system_name == "Automated Equity Research Engine"
    assert topology.status == "OPERATIONAL"
    assert len(topology.subsystems) >= 6
    logger.info(f"✅ Assertion 1 Passed: Core topology metadata verified ({len(topology.subsystems)} subsystems).")

    # 2. Inspect Node Consistency
    all_node_ids = set()
    total_nodes = 0
    for sub in topology.subsystems:
        assert len(sub.nodes) > 0, f"Subsystem {sub.id} must contain nodes"
        for node in sub.nodes:
            assert node.id not in all_node_ids, f"Duplicate node ID detected: {node.id}"
            all_node_ids.add(node.id)
            assert node.latency_sla_ms > 0.0, f"Node {node.id} must have positive latency target"
            assert node.protocol, f"Node {node.id} must declare communication protocol"
            total_nodes += 1

    assert total_nodes >= 12
    logger.info(f"✅ Assertion 2 Passed: {total_nodes} unique architecture nodes verified with latency SLAs.")

    # 3. Inspect Edge Integrity & Directed Flow Graph
    assert len(topology.edges) >= 10
    for edge in topology.edges:
        assert edge.source in all_node_ids, f"Edge source '{edge.source}' does not exist in node registry"
        assert edge.target in all_node_ids, f"Edge target '{edge.target}' does not exist in node registry"
        assert edge.protocol in ["HTTP", "WS", "REDIS_STREAM", "SQL", "IPC"]
    logger.info(
        f"✅ Assertion 3 Passed: {len(topology.edges)} directed data flow edges verified with complete referential integrity."
    )

    # 4. Inspect Mermaid Blueprint Syntax
    mermaid = topology.mermaid_diagram
    assert "graph TD" in mermaid
    assert "Trading Dashboard" in mermaid
    assert "FastAPI" in mermaid
    assert "Redis Streams" in mermaid
    assert "LangGraph" in mermaid
    assert "PostgreSQL" in mermaid
    assert "pgvector" in mermaid
    assert "Distributed Cache-Aside" in mermaid
    logger.info("✅ Assertion 4 Passed: Canonical Mermaid diagram syntax and system components validated.")

    # 5. Inspect REST API Contract via ASGI Transport
    transport = ASGITransport(app=app)
    headers = {"X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026"}

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/v1/system/architecture", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "subsystems" in data
        assert "edges" in data
        assert "mermaid_diagram" in data
        assert "trace_id" in data

        res_mmd = await client.get("/v1/system/architecture/mermaid", headers=headers)
        assert res_mmd.status_code == 200
        assert "graph TD" in res_mmd.text

    logger.info("✅ Assertion 5 Passed: REST API contract & Mermaid plain-text endpoints verified.")

    logger.info("================================================================================")
    logger.info("[TOPOLOGY CERTIFIED] 5/5 ARCHITECTURE SPECIFICATION ASSERTIONS PASSED 100%")
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_architecture_audit())
