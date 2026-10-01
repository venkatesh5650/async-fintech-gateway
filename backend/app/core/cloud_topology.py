"""
Cloud Topology & Infrastructure-as-Code Registry
------------------------------------------------
Parses declarative infrastructure-as-code manifests (render.yaml)
and exposes the active cloud service graph, compute runtimes,
managed databases, and dependency interconnects.
"""

from datetime import datetime, timezone
import logging
import os
from typing import Optional
import yaml

from app.core.telemetry import generate_trace_id
from app.database.schemas import (
    CloudDependencyEdge,
    CloudResourceNode,
    CloudTopologyReport,
)

logger = logging.getLogger("cloud_topology")

_CANONICAL_FALLBACK_YAML = """version: "1"

services:
  - type: web
    name: fintech-api-gateway
    env: docker
    plan: free
    rootDir: backend
    dockerfilePath: Dockerfile.api
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: fintech-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          type: redis
          name: fintech-redis
          property: connectionString
      - key: GROQ_API_KEY
        sync: false
      - key: N8N_API_KEY
        sync: false

  - type: worker
    name: fintech-stream-worker
    env: docker
    plan: free
    rootDir: backend
    dockerfilePath: Dockerfile.worker
    autoDeploy: true
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: fintech-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          type: redis
          name: fintech-redis
          property: connectionString

  - type: redis
    name: fintech-redis
    plan: free
    ipAllowList: []
    maxmemoryPolicy: volatile-lru

databases:
  - name: fintech-postgres
    databaseName: fintech_db
    user: admin
    plan: free
    postgresMajorVersion: "15"
    ipAllowList: []
"""


class CloudTopologyRegistry:
    """Manages cloud infrastructure topology models and IaC validation."""

    def __init__(self, root_dir: Optional[str] = None):
        if root_dir:
            self.root_dir = os.path.abspath(root_dir)
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            # current_dir: backend/app/core -> project root is 3 levels up
            self.root_dir = os.path.abspath(os.path.join(current_dir, "../../.."))

    def get_iac_manifest_path(self) -> str:
        """Searches for render.yaml across potential project roots or container locations."""
        candidates = [
            os.path.join(self.root_dir, "render.yaml"),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../render.yaml")),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../render.yaml")),
            "/app/render.yaml",
        ]
        for p in candidates:
            if os.path.exists(p):
                return p

        # Traverse upwards from current file
        curr = os.path.dirname(os.path.abspath(__file__))
        for _ in range(5):
            trial = os.path.join(curr, "render.yaml")
            if os.path.exists(trial):
                return trial
            parent = os.path.dirname(curr)
            if parent == curr:
                break
            curr = parent

        return os.path.join(self.root_dir, "render.yaml")

    def load_raw_manifest(self) -> tuple[dict, str]:
        """Reads and parses render.yaml manifest safely with fallback."""
        path = self.get_iac_manifest_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                raw_text = f.read()
        else:
            raw_text = _CANONICAL_FALLBACK_YAML

        parsed = yaml.safe_load(raw_text) or {}
        return parsed, raw_text

    def build_topology_report(self, trace_id: Optional[str] = None) -> CloudTopologyReport:
        """Constructs an end-to-end topology report from the IaC manifest."""
        trace = trace_id or generate_trace_id()
        manifest, raw_yaml = self.load_raw_manifest()

        nodes: list[CloudResourceNode] = []
        services = manifest.get("services", [])
        databases = manifest.get("databases", [])

        # Process Compute Services (web, worker)
        for svc in services:
            svc_type = svc.get("type", "web")
            if svc_type == "redis":
                continue  # Handled in managed cache section

            svc_name = svc.get("name", "unknown")
            is_worker = svc_type == "worker"
            node_id = "stream_worker" if is_worker else "api_gateway"

            env_vars = svc.get("envVars", [])
            nodes.append(
                CloudResourceNode(
                    id=node_id,
                    name=svc_name,
                    resource_type="background_worker" if is_worker else "web_service",
                    runtime=svc.get("env", "docker"),
                    plan=svc.get("plan", "free"),
                    dockerfile_path=svc.get("dockerfilePath"),
                    health_check_path=svc.get("healthCheckPath"),
                    auto_deploy=svc.get("autoDeploy", True),
                    env_vars_count=len(env_vars),
                    status="CONFIGURED",
                )
            )

        # Process Redis Service (if present under services)
        redis_services = [s for s in services if s.get("type") == "redis"]
        if redis_services:
            redis_svc = redis_services[0]
            nodes.append(
                CloudResourceNode(
                    id="redis_broker",
                    name=redis_svc.get("name", "fintech-redis"),
                    resource_type="managed_cache",
                    runtime="redis-7",
                    plan=redis_svc.get("plan", "free"),
                    dockerfile_path=None,
                    health_check_path=None,
                    auto_deploy=False,
                    env_vars_count=0,
                    status="ACTIVE",
                )
            )

        # Process Databases
        for db in databases:
            db_name = db.get("name", "fintech-postgres")
            nodes.append(
                CloudResourceNode(
                    id="postgres_db",
                    name=db_name,
                    resource_type="managed_database",
                    runtime=f"postgresql-{db.get('postgresMajorVersion', '15')}",
                    plan=db.get("plan", "free"),
                    dockerfile_path=None,
                    health_check_path=None,
                    auto_deploy=False,
                    env_vars_count=0,
                    status="ACTIVE",
                )
            )

        # Define Canonical Cloud Dependency Edges
        edges = [
            CloudDependencyEdge(
                source_id="api_gateway",
                target_id="redis_broker",
                protocol="REDIS_STREAM",
                purpose="Asynchronous job ingestion (XADD) & Cache-Aside lookups",
                is_critical=True,
            ),
            CloudDependencyEdge(
                source_id="stream_worker",
                target_id="redis_broker",
                protocol="REDIS_STREAM",
                purpose="Consumer group execution (XREADGROUP), DLQ routing & PEL recovery",
                is_critical=True,
            ),
            CloudDependencyEdge(
                source_id="api_gateway",
                target_id="postgres_db",
                protocol="SQL",
                purpose="Session auth, REST API read queries & audit registry reads",
                is_critical=True,
            ),
            CloudDependencyEdge(
                source_id="stream_worker",
                target_id="postgres_db",
                protocol="SQL",
                purpose="Deterministic quantitative signal persistence & pgvector semantic search",
                is_critical=True,
            ),
        ]

        total_svcs = len([n for n in nodes if n.resource_type in ("web_service", "background_worker")])
        total_dbs = len([n for n in nodes if n.resource_type in ("managed_database", "managed_cache")])

        return CloudTopologyReport(
            system_name="Automated Equity Research Engine",
            version="v1.0.0-rc",
            environment="cloud_production",
            iac_spec_path="render.yaml",
            total_services=total_svcs,
            total_datastores=total_dbs,
            total_edges=len(edges),
            nodes=nodes,
            edges=edges,
            raw_yaml_spec=raw_yaml,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            trace_id=trace,
        )
