"""
Cloud Orchestration & Infrastructure Router
-------------------------------------------
Exposes REST endpoints for container specifications, cloud topology,
health probes, environment compliance, and production seeding pipelines.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, status
from fastapi.responses import JSONResponse

from app.core.cloud_topology import CloudTopologyRegistry
from app.core.docker_spec import ContainerBuildDiagnosticsManager
from app.core.env_auditor import EnvironmentConfigAuditor
from app.core.health_probes import CloudReadinessProbeManager
from app.core.grafana_spec import GrafanaSpecManager, SloThresholdEvaluator
from app.core.go_live_certifier import go_live_certifier
from app.core.migration_runner import DatabaseMigrationRunner
from app.core.production_ingress import ingress_config_manager
from app.core.production_seeder import ProductionSeedManager
from app.core.telemetry_metrics import MetricsRegistryManager
from app.core.telemetry import generate_trace_id, parse_traceparent
from app.core.trace_aggregator import trace_aggregator
from app.database.schemas import (
    AlertDispatchTestRequest,
    AlertDispatchTestResponse,
    CloudTopologyReport,
    ContainerSpecReport,
    EnvironmentAuditReport,
    GoLiveCertificate,
    GrafanaDashboardSpec,
    IngressVerificationReport,
    LivenessProbeResult,
    MetricSummaryReport,
    MigrationStatusReport,
    ProductionIngressSpec,
    ProductionReadinessReport,
    ReadinessProbeResult,
    SeedExecutionRequest,
    SeedExecutionResponse,
    SeedStatusReport,
    SloStatusReport,
    SmokeTestResult,
    StartupProbeResult,
    TieredHealthMatrixReport,
    TraceQueryResponse,
    TraceSimulationRequest,
    TraceSimulationResponse,
    TraceWaterfallDetail,
    TrafficSimulationRequest,
    TrafficSimulationResponse,
)

logger = logging.getLogger("cloud_router")

router = APIRouter(
    prefix="/v1/cloud",
    tags=["Cloud Orchestration & Infrastructure"],
)

_diagnostics_manager = ContainerBuildDiagnosticsManager()
_topology_registry = CloudTopologyRegistry()
_health_probe_manager = CloudReadinessProbeManager()
_env_auditor = EnvironmentConfigAuditor()
_migration_runner = DatabaseMigrationRunner()
_seed_manager = ProductionSeedManager()
_metrics_manager = MetricsRegistryManager.get_instance()
_slo_evaluator = SloThresholdEvaluator()


@router.get(
    "/docker-spec",
    response_model=ContainerSpecReport,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Container Build Specifications",
    description="Inspects multi-stage Dockerfiles and .dockerignore hygiene for all microservices.",
)
async def get_container_docker_spec(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> ContainerSpecReport:
    """Returns detailed diagnostics of production container specifications."""
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    report = _diagnostics_manager.generate_full_report(trace_id=trace_id)
    logger.info(
        f"Container specification audit generated: status={report.status}, score={report.compliance_score_pct}%, trace_id={trace_id}"
    )
    return report


@router.get(
    "/topology",
    response_model=CloudTopologyReport,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Cloud Infrastructure Topology",
    description="Parses render.yaml IaC manifest and returns the active service and data store graph.",
)
async def get_cloud_topology(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> CloudTopologyReport:
    """Returns parsed cloud topology including compute nodes and dependency edges."""
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    try:
        report = _topology_registry.build_topology_report(trace_id=trace_id)
        logger.info(
            f"Cloud topology report generated: nodes={len(report.nodes)}, edges={len(report.edges)}, trace_id={trace_id}"
        )
        return report
    except Exception as e:
        logger.error(f"Error generating topology report: {e}, using fallback registry")
        fallback_registry = CloudTopologyRegistry()
        return fallback_registry.build_topology_report(trace_id=trace_id)


# ------------------------------------------------------------------------------
# Tiered Cloud Health Probes
# ------------------------------------------------------------------------------


@router.get(
    "/health/matrix",
    response_model=TieredHealthMatrixReport,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Cloud Health Matrix",
    description="Returns aggregated liveness, readiness, and startup health telemetry.",
)
async def get_health_matrix(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> TieredHealthMatrixReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return await _health_probe_manager.compile_health_matrix(trace_id=trace_id)


@router.get(
    "/health/liveness",
    response_model=LivenessProbeResult,
    status_code=status.HTTP_200_OK,
    summary="ASGI Process Liveness Probe",
    description="Sub-5ms event-loop heartbeat verifying application container is responsive.",
)
async def get_liveness_probe() -> LivenessProbeResult:
    return await _health_probe_manager.check_liveness()


@router.get(
    "/health/readiness",
    response_model=ReadinessProbeResult,
    summary="Deep Dependency Readiness Probe",
    description="Validates PostgreSQL, Redis, and pgvector extension availability. Returns 200 or 503.",
)
async def get_readiness_probe():
    result = await _health_probe_manager.check_readiness()
    status_code = status.HTTP_200_OK if result.overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=result.model_dump())


@router.get(
    "/health/startup",
    response_model=StartupProbeResult,
    summary="Cold-Start Initialization Probe",
    description="Verifies database tables exist and schema is initialized.",
)
async def get_startup_probe():
    result = await _health_probe_manager.check_startup()
    status_code = status.HTTP_200_OK if result.schema_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=result.model_dump())


# ------------------------------------------------------------------------------
# Multi-Environment Security & Secret Sanitization Audit
# ------------------------------------------------------------------------------


@router.get(
    "/env-audit",
    response_model=EnvironmentAuditReport,
    status_code=status.HTTP_200_OK,
    summary="Environment Security & Credential Compliance Audit",
    description="Evaluates 10-point production security compliance and returns zero-leak masked credentials.",
)
async def get_environment_audit(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> EnvironmentAuditReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return _env_auditor.audit(trace_id=trace_id)


# ------------------------------------------------------------------------------
# Production Database Migration & Seeding Pipeline
# ------------------------------------------------------------------------------


@router.get(
    "/migration/status",
    response_model=MigrationStatusReport,
    status_code=status.HTTP_200_OK,
    summary="Database Migration & Schema Status",
    description="Inspects relational tables and pgvector extension readiness.",
)
async def get_migration_status(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> MigrationStatusReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return await _migration_runner.verify_or_apply_migrations(trace_id=trace_id)


@router.get(
    "/seed/status",
    response_model=SeedStatusReport,
    status_code=status.HTTP_200_OK,
    summary="Production Seed Pipeline Status",
    description="Returns data density metrics (candles, signals, RAG chunks) across 10 benchmark equities.",
)
async def get_seed_status(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> SeedStatusReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return await _seed_manager.get_seed_status(trace_id=trace_id)


@router.post(
    "/seed/run",
    response_model=SeedExecutionResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute Production Seeding Pipeline",
    description="Deterministically populates daily candles, computed signals, and SEC EDGAR RAG passages with full idempotency.",
)
async def run_production_seed(
    request: Optional[SeedExecutionRequest] = None,
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> SeedExecutionResponse:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return await _seed_manager.run_seed(request=request, trace_id=trace_id)


# ------------------------------------------------------------------------------
# Prometheus Metric Exporters & Latency Telemetry (Day 96)
# ------------------------------------------------------------------------------


@router.get(
    "/metrics/summary",
    response_model=MetricSummaryReport,
    status_code=status.HTTP_200_OK,
    summary="Prometheus Golden Signals & Metric Summary",
    description="Aggregates live Prometheus telemetry (RPS throughput, P50/P90/P99 latency, stream lag, cache hit rates).",
)
async def get_metrics_summary(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> MetricSummaryReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    summary_data = _metrics_manager.get_metrics_summary()
    summary_data["timestamp_iso"] = datetime.now(timezone.utc).isoformat()
    summary_data["trace_id"] = trace_id
    return MetricSummaryReport(**summary_data)


@router.post(
    "/metrics/simulate-traffic",
    response_model=TrafficSimulationResponse,
    status_code=status.HTTP_200_OK,
    summary="Inject Synthetic Inbound Traffic",
    description="Simulates multi-asset traffic to populate Prometheus counters and latency histogram distribution buckets.",
)
async def simulate_traffic_endpoint(
    request: Optional[TrafficSimulationRequest] = None,
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> TrafficSimulationResponse:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    count = request.count if request else 25
    result = _metrics_manager.simulate_traffic(count=count)
    return TrafficSimulationResponse(
        simulated_requests=result["simulated_requests"],
        status=result["status"],
        message=result["message"],
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        trace_id=trace_id,
    )


# ------------------------------------------------------------------------------
# Grafana Dashboard Specifications & SLI/SLO Alerts (Day 97)
# ------------------------------------------------------------------------------


@router.get(
    "/grafana/spec",
    response_model=GrafanaDashboardSpec,
    status_code=status.HTTP_200_OK,
    summary="Export Declarative Grafana Dashboard Specification",
    description="Returns production Grafana JSON model with 6 Golden Signal panels and PromQL metrics queries.",
)
async def get_grafana_dashboard_spec(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> GrafanaDashboardSpec:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    spec = GrafanaSpecManager.get_dashboard_json()
    spec["timestamp_iso"] = datetime.now(timezone.utc).isoformat()
    spec["trace_id"] = trace_id
    return GrafanaDashboardSpec(**spec)


@router.get(
    "/slo/status",
    response_model=SloStatusReport,
    status_code=status.HTTP_200_OK,
    summary="Evaluate Real-Time SRE SLI/SLO Adherence",
    description="Calculates compliance, error budget burn rates, and evaluates 4 core FinTech SLO agreements.",
)
async def get_slo_status_report(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> SloStatusReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    slo_data = _slo_evaluator.evaluate_slos()
    slo_data["timestamp_iso"] = datetime.now(timezone.utc).isoformat()
    slo_data["trace_id"] = trace_id
    return SloStatusReport(**slo_data)


@router.post(
    "/alerts/test-dispatch",
    response_model=AlertDispatchTestResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger Synthetic Prometheus Alert Notification Test",
    description="Dispatches a test alert event simulating Discord webhook and n8n orchestration triggers.",
)
async def test_alert_dispatch(
    request: Optional[AlertDispatchTestRequest] = None,
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> AlertDispatchTestResponse:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    if not trace_id:
        trace_id = generate_trace_id()

    alert_name = request.alert_name if request else "P99LatencyBreach"
    severity = request.severity if request else "WARNING"
    msg = request.message if request else None

    result = _slo_evaluator.dispatch_test_alert(alert_name=alert_name, severity=severity, message=msg)
    return AlertDispatchTestResponse(
        status=result["status"],
        alert_name=result["alert_name"],
        severity=result["severity"],
        message=result["message"],
        dispatched_to=result["dispatched_to"],
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        trace_id=trace_id,
    )


# ==============================================================================
# DAY 98: DISTRIBUTED TRACING & W3C SPAN WATERFALL ENDPOINTS
# ==============================================================================

@router.get(
    "/traces",
    response_model=TraceQueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Query Distributed Traces",
    description="Queries recent W3C distributed traces with optional status and ticker filtering.",
)
async def query_distributed_traces(
    limit: int = 50,
    status_filter: Optional[str] = None,
    ticker: Optional[str] = None,
) -> TraceQueryResponse:
    return trace_aggregator.query_traces(limit=limit, status_filter=status_filter, ticker=ticker)


@router.get(
    "/traces/{trace_id}/waterfall",
    response_model=TraceWaterfallDetail,
    status_code=status.HTTP_200_OK,
    summary="Get Hierarchical W3C Span Waterfall",
    description="Returns microsecond Gantt timing, hierarchical parent-child depth, and critical path analysis for a trace.",
)
async def get_trace_waterfall(
    trace_id: str,
) -> Any:
    waterfall = trace_aggregator.get_waterfall(trace_id)
    if not waterfall:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": f"Trace ID '{trace_id}' not found in active telemetry buffer."},
        )
    return waterfall


@router.post(
    "/traces/simulate",
    response_model=TraceSimulationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Simulate Distributed Multi-Hop Transaction",
    description="Generates an end-to-end multi-service W3C distributed trace across Gateway, Cache, DB, Streams, Worker, RAG, and WebSocket.",
)
async def simulate_distributed_trace(
    request: Optional[TraceSimulationRequest] = None,
) -> TraceSimulationResponse:
    ticker = request.ticker if request else "AAPL"
    scenario = request.scenario if request else "SUCCESS"
    err = request.error_injected if request else False

    waterfall = trace_aggregator.generate_synthetic_trace(
        ticker=ticker,
        scenario=scenario,
        error_injected=err,
    )

    return TraceSimulationResponse(
        status="SIMULATED",
        trace_id=waterfall.trace_id,
        ticker=ticker.upper(),
        span_count=waterfall.span_count,
        total_duration_ms=waterfall.total_duration_ms,
        waterfall=waterfall,
    )


# ==============================================================================
# DAY 99: PRODUCTION INGRESS, DOMAINS & TLS 1.3 TERMINATION ENDPOINTS
# ==============================================================================

@router.get(
    "/ingress/spec",
    response_model=ProductionIngressSpec,
    status_code=status.HTTP_200_OK,
    summary="Get Production Ingress, Domains & TLS 1.3 Specification",
    description="Returns declarative edge reverse proxy configuration, TLS certificates, security headers, and domain routing.",
)
async def get_production_ingress_spec(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> ProductionIngressSpec:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return ingress_config_manager.get_ingress_spec(trace_id=trace_id)


@router.post(
    "/ingress/verify",
    response_model=IngressVerificationReport,
    status_code=status.HTTP_200_OK,
    summary="Verify Production Ingress Security Hardening",
    description="Executes automated verification of TLS 1.3 enforcement, HSTS preload compliance, Clickjacking denial, and edge rate limits.",
)
async def verify_production_ingress_security(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> IngressVerificationReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return ingress_config_manager.verify_ingress_security(trace_id=trace_id)


# ==============================================================================
# DAY 100: PHASE 3 CAPSTONE SEAL & PRODUCTION GO-LIVE ENDPOINTS
# ==============================================================================

@router.get(
    "/capstone/readiness",
    response_model=ProductionReadinessReport,
    status_code=status.HTTP_200_OK,
    summary="Evaluate Production Go-Live Readiness (10-Point Checklist)",
    description="Aggregates verified criteria across Days 91-100 including Docker, IaC, health probes, secrets, pgvector, metrics, SLOs, tracing, and ingress.",
)
async def get_production_readiness_report(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> ProductionReadinessReport:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return go_live_certifier.get_readiness_report(trace_id=trace_id)


@router.post(
    "/capstone/smoke-test",
    response_model=SmokeTestResult,
    status_code=status.HTTP_200_OK,
    summary="Execute Live Multi-Service Synthetic Smoke Test",
    description="Runs full-spectrum synthetic transaction verifying zero-trust perimeter, database ACID commit, Redis mutex, streams PEL, vector search, and WebSocket fanout.",
)
async def execute_production_smoke_test(
    ticker: str = "AAPL",
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> SmokeTestResult:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return go_live_certifier.execute_smoke_test(ticker=ticker, trace_id=trace_id)


@router.get(
    "/capstone/certificate",
    response_model=GoLiveCertificate,
    status_code=status.HTTP_200_OK,
    summary="Get Cryptographically Signed Go-Live Production Certificate",
    description="Returns official institutional Phase 3 Milestone 2 Capstone Certificate with SHA-256 integrity signature.",
)
async def get_go_live_certificate(
    traceparent: Optional[str] = Header(None, alias="traceparent"),
) -> GoLiveCertificate:
    trace_id = None
    if traceparent:
        trace_id, _ = parse_traceparent(traceparent)
    return go_live_certifier.generate_certificate(trace_id=trace_id)






