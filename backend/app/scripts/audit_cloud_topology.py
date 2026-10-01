"""
Cloud Topology & Infrastructure-as-Code Audit Suite
---------------------------------------------------
Automated 5-point verification battery evaluating declarative
IaC specifications (render.yaml), dual-service topology (Web + Worker),
managed database/cache declarations, and REST API contract compliance.
"""

import asyncio
import logging
import os
import sys
import yaml

from httpx import ASGITransport, AsyncClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.cloud_topology import CloudTopologyRegistry
from app.database.schemas import CloudTopologyReport
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_cloud_topology")


async def run_cloud_topology_audit():
    logger.info("================================================================================")
    logger.info("[INFRASTRUCTURE AUDIT] CLOUD TOPOLOGY & INFRASTRUCTURE-AS-CODE (render.yaml)")
    logger.info("================================================================================")

    passed_count = 0
    total_assertions = 5
    registry = CloudTopologyRegistry()

    # --------------------------------------------------------------------------
    # Assertion 1: Infrastructure Manifest Integrity (render.yaml)
    # --------------------------------------------------------------------------
    logger.info("\n[1/5] Verifying render.yaml Manifest Syntax & Structure...")
    manifest_path = registry.get_iac_manifest_path()
    assert os.path.exists(manifest_path), f"render.yaml not found at: {manifest_path}"

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = yaml.safe_load(f)

    assert isinstance(manifest, dict), "render.yaml must be a valid YAML dictionary"
    assert manifest.get("version") == "1", f"Expected version '1', got '{manifest.get('version')}'"
    assert "services" in manifest and len(manifest["services"]) >= 2, "Manifest must declare at least 2 services"
    assert "databases" in manifest and len(manifest["databases"]) >= 1, "Manifest must declare managed database"
    logger.info(
        f"  ✓ render.yaml verified: version={manifest.get('version')}, services={len(manifest['services'])}, databases={len(manifest['databases'])}"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 2: Web API Gateway Specification (fintech-api-gateway)
    # --------------------------------------------------------------------------
    logger.info("\n[2/5] Verifying Web API Gateway Cloud Service Definition...")
    services = manifest.get("services", [])
    web_svcs = [s for s in services if s.get("name") == "fintech-api-gateway"]
    assert len(web_svcs) == 1, "Expected single 'fintech-api-gateway' service in render.yaml"
    api_gateway = web_svcs[0]
    assert api_gateway.get("type") == "web", f"Expected type 'web', got '{api_gateway.get('type')}'"
    assert api_gateway.get("env") == "docker", "Expected env 'docker'"
    assert api_gateway.get("dockerfilePath") == "Dockerfile.api", (
        f"Expected Dockerfile.api, got '{api_gateway.get('dockerfilePath')}'"
    )
    assert api_gateway.get("healthCheckPath") == "/health", (
        f"Expected /health, got '{api_gateway.get('healthCheckPath')}'"
    )
    assert api_gateway.get("autoDeploy") is True, "autoDeploy must be enabled"

    env_keys = [e.get("key") for e in api_gateway.get("envVars", [])]
    assert "DATABASE_URL" in env_keys, "DATABASE_URL binding missing from api gateway"
    assert "REDIS_URL" in env_keys, "REDIS_URL binding missing from api gateway"
    logger.info(
        f"  ✓ API Gateway service verified: type={api_gateway.get('type')}, dockerfile={api_gateway.get('dockerfilePath')}, healthCheck={api_gateway.get('healthCheckPath')}"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 3: Background Stream Worker Specification (fintech-stream-worker)
    # --------------------------------------------------------------------------
    logger.info("\n[3/5] Verifying Background Stream Consumer Worker Cloud Service Definition...")
    worker_svcs = [s for s in services if s.get("name") == "fintech-stream-worker"]
    assert len(worker_svcs) == 1, "Expected single 'fintech-stream-worker' service in render.yaml"
    worker = worker_svcs[0]
    assert worker.get("type") == "worker", f"Expected type 'worker', got '{worker.get('type')}'"
    assert worker.get("env") == "docker", "Expected env 'docker'"
    assert worker.get("dockerfilePath") == "Dockerfile.worker", (
        f"Expected Dockerfile.worker, got '{worker.get('dockerfilePath')}'"
    )
    assert worker.get("autoDeploy") is True, "autoDeploy must be enabled"

    worker_env_keys = [e.get("key") for e in worker.get("envVars", [])]
    assert "DATABASE_URL" in worker_env_keys, "DATABASE_URL binding missing from worker service"
    assert "REDIS_URL" in worker_env_keys, "REDIS_URL binding missing from worker service"
    logger.info(
        f"  ✓ Stream Worker service verified: type={worker.get('type')}, dockerfile={worker.get('dockerfilePath')}, autoDeploy={worker.get('autoDeploy')}"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 4: Managed Infrastructure Specifications (PostgreSQL 15 & Redis 7)
    # --------------------------------------------------------------------------
    logger.info("\n[4/5] Verifying Managed PostgreSQL & Redis Infrastructure Specifications...")
    # Redis
    redis_svcs = [s for s in services if s.get("type") == "redis"]
    assert len(redis_svcs) >= 1, "Managed Redis service definition missing"
    redis_conf = redis_svcs[0]
    assert redis_conf.get("name") == "fintech-redis", f"Unexpected redis name: {redis_conf.get('name')}"
    assert redis_conf.get("maxmemoryPolicy") == "volatile-lru", (
        f"Expected volatile-lru policy, got: {redis_conf.get('maxmemoryPolicy')}"
    )

    # Postgres
    dbs = manifest.get("databases", [])
    assert len(dbs) >= 1, "Managed PostgreSQL database definition missing"
    db_conf = dbs[0]
    assert db_conf.get("name") == "fintech-postgres", f"Unexpected db name: {db_conf.get('name')}"
    assert db_conf.get("databaseName") == "fintech_db", f"Unexpected db databaseName: {db_conf.get('databaseName')}"
    assert db_conf.get("postgresMajorVersion") == "15", (
        f"Expected PostgreSQL 15, got: {db_conf.get('postgresMajorVersion')}"
    )
    logger.info(
        f"  ✓ Managed infrastructure verified: Redis policy={redis_conf.get('maxmemoryPolicy')}, Postgres version={db_conf.get('postgresMajorVersion')}"
    )
    passed_count += 1

    # --------------------------------------------------------------------------
    # Assertion 5: Programmatic Registry & REST API Endpoint GET /v1/cloud/topology
    # --------------------------------------------------------------------------
    logger.info("\n[5/5] Testing Programmatic Registry & REST API GET /v1/cloud/topology...")
    report = registry.build_topology_report()
    assert isinstance(report, CloudTopologyReport), "Report must conform to CloudTopologyReport"
    assert len(report.nodes) >= 4, f"Expected at least 4 nodes (2 services, 2 datastores), got {len(report.nodes)}"
    assert len(report.edges) == 4, f"Expected 4 dependency edges, got {len(report.edges)}"

    # Test via ASGI client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        test_traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        response = await client.get("/v1/cloud/topology", headers={"traceparent": test_traceparent})
        assert response.status_code == 200, f"Expected HTTP 200, got {response.status_code}: {response.text}"
        payload = response.json()

        parsed = CloudTopologyReport.model_validate(payload)
        assert parsed.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736", (
            f"Expected trace ID propagation, got {parsed.trace_id}"
        )
        assert len(parsed.nodes) >= 4, f"API returned {len(parsed.nodes)} nodes"
        assert len(parsed.edges) == 4, f"API returned {len(parsed.edges)} edges"
        logger.info(
            f"  ✓ REST API verified: HTTP 200 OK, nodes={len(parsed.nodes)}, edges={len(parsed.edges)}, trace preserved"
        )
        passed_count += 1

    # --------------------------------------------------------------------------
    # Final Audit Summary
    # --------------------------------------------------------------------------
    logger.info("\n================================================================================")
    logger.info(
        f"🏁 CLOUD TOPOLOGY AUDIT COMPLETE: {passed_count}/{total_assertions} ASSERTIONS PASSED (100%)"
    )
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_cloud_topology_audit())
