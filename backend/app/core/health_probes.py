"""
Cloud-Native Tiered Health Probes Manager
-----------------------------------------
Executes tiered Kubernetes/Render orchestration probes:
1. Liveness: Sub-5ms ASGI process heartbeat.
2. Readiness: Deep dependency validation across PostgreSQL, Redis, and pgvector.
3. Startup: Cold-start initialization verification of schema tables.
"""

import asyncio
from datetime import datetime, timezone
import logging
import time
from typing import Optional

from sqlalchemy import text

from app.core.broker import get_redis_client
from app.core.telemetry import generate_trace_id
from app.database.database import engine
from app.database.schemas import (
    LivenessProbeResult,
    ReadinessProbeResult,
    StartupProbeResult,
    SubsystemProbe,
    TieredHealthMatrixReport,
)

logger = logging.getLogger("health_probes")

_SERVICE_START_TIME = time.time()


class CloudReadinessProbeManager:
    """Orchestrates tiered liveness, readiness, and startup health verification."""

    def __init__(self):
        self.start_time = _SERVICE_START_TIME

    async def check_liveness(self) -> LivenessProbeResult:
        """Fast process liveness check (<5ms). Validates event loop is operational."""
        uptime = round(time.time() - self.start_time, 2)
        return LivenessProbeResult(
            status="HEALTHY",
            uptime_seconds=uptime,
            event_loop_healthy=True,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
        )

    async def check_readiness(self) -> ReadinessProbeResult:
        """Deep dependency check for PostgreSQL, Redis 7, and pgvector extension."""
        start_ts = time.perf_counter()
        subsystems: list[SubsystemProbe] = []

        # 1. PostgreSQL Connection & Latency
        pg_start = time.perf_counter()
        try:
            async with engine.connect() as conn:
                res = await conn.execute(text("SELECT 1;"))
                scalar = res.scalar()
                pg_latency = round((time.perf_counter() - pg_start) * 1000, 2)
                if scalar == 1:
                    subsystems.append(
                        SubsystemProbe(
                            name="postgresql",
                            status="HEALTHY",
                            latency_ms=pg_latency,
                            is_critical=True,
                            details="Connection pool operational, ping successful",
                        )
                    )
                else:
                    subsystems.append(
                        SubsystemProbe(
                            name="postgresql",
                            status="UNHEALTHY",
                            latency_ms=pg_latency,
                            is_critical=True,
                            details=f"Unexpected query response: {scalar}",
                        )
                    )
        except Exception as e:
            pg_latency = round((time.perf_counter() - pg_start) * 1000, 2)
            logger.warning(f"PostgreSQL readiness probe failed: {e}")
            subsystems.append(
                SubsystemProbe(
                    name="postgresql",
                    status="UNHEALTHY",
                    latency_ms=pg_latency,
                    is_critical=True,
                    details=f"Database unreachable: {str(e)[:100]}",
                )
            )

        # 2. pgvector Extension Check
        vec_start = time.perf_counter()
        try:
            async with engine.connect() as conn:
                res = await conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector';"))
                has_vector = res.scalar() is not None
                vec_latency = round((time.perf_counter() - vec_start) * 1000, 2)
                subsystems.append(
                    SubsystemProbe(
                        name="pgvector",
                        status="HEALTHY" if has_vector else "DEGRADED",
                        latency_ms=vec_latency,
                        is_critical=False,
                        details="Extension installed" if has_vector else "Extension not installed",
                    )
                )
        except Exception as e:
            vec_latency = round((time.perf_counter() - vec_start) * 1000, 2)
            subsystems.append(
                SubsystemProbe(
                    name="pgvector",
                    status="DEGRADED",
                    latency_ms=vec_latency,
                    is_critical=False,
                    details=f"Vector check query error: {str(e)[:100]}",
                )
            )

        # 3. Redis Central Cache & Streams PING
        redis_start = time.perf_counter()
        try:
            client = await get_redis_client()
            pong = await client.ping()
            redis_latency = round((time.perf_counter() - redis_start) * 1000, 2)
            if pong:
                subsystems.append(
                    SubsystemProbe(
                        name="redis",
                        status="HEALTHY",
                        latency_ms=redis_latency,
                        is_critical=True,
                        details="Redis ping successful",
                    )
                )
            else:
                subsystems.append(
                    SubsystemProbe(
                        name="redis",
                        status="UNHEALTHY",
                        latency_ms=redis_latency,
                        is_critical=True,
                        details="Ping returned falsy value",
                    )
                )
        except Exception as e:
            redis_latency = round((time.perf_counter() - redis_start) * 1000, 2)
            logger.warning(f"Redis readiness probe failed: {e}")
            subsystems.append(
                SubsystemProbe(
                    name="redis",
                    status="UNHEALTHY",
                    latency_ms=redis_latency,
                    is_critical=True,
                    details=f"Redis unreachable: {str(e)[:100]}",
                )
            )

        # Evaluate Overall Readiness
        critical_failed = any(s.status == "UNHEALTHY" and s.is_critical for s in subsystems)
        overall_ready = not critical_failed
        total_latency = round((time.perf_counter() - start_ts) * 1000, 2)

        return ReadinessProbeResult(
            status="READY" if overall_ready else "NOT_READY",
            overall_healthy=overall_ready,
            subsystems=subsystems,
            total_latency_ms=total_latency,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
        )

    async def check_startup(self) -> StartupProbeResult:
        """Verifies database schema readiness and table existence on cold start."""
        expected_tables = ["tickers", "market_pricing", "document_chunks", "computed_signals"]
        found_tables: list[str] = []

        try:
            async with engine.connect() as conn:
                res = await conn.execute(
                    text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
                )
                rows = res.fetchall()
                all_public_tables = [r[0] for r in rows]

                for t in expected_tables:
                    if t in all_public_tables:
                        found_tables.append(t)

            schema_ready = len(found_tables) >= 2
            return StartupProbeResult(
                status="INITIALIZED" if schema_ready else "IN_PROGRESS",
                schema_ready=schema_ready,
                migrations_current=schema_ready,
                tables_found=found_tables,
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as e:
            logger.warning(f"Startup probe schema check failed: {e}")
            return StartupProbeResult(
                status="FAILED",
                schema_ready=False,
                migrations_current=False,
                tables_found=[],
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
            )

    async def compile_health_matrix(self, trace_id: Optional[str] = None) -> TieredHealthMatrixReport:
        """Assembles comprehensive multi-probe health matrix."""
        trace = trace_id or generate_trace_id()

        liveness_res, readiness_res, startup_res = await asyncio.gather(
            self.check_liveness(),
            self.check_readiness(),
            self.check_startup(),
        )

        if readiness_res.overall_healthy and startup_res.schema_ready:
            overall_status = "HEALTHY"
        elif any(s.status == "UNHEALTHY" for s in readiness_res.subsystems if s.is_critical):
            overall_status = "UNHEALTHY"
        else:
            overall_status = "DEGRADED"

        return TieredHealthMatrixReport(
            system_name="Automated Equity Research Engine",
            overall_status=overall_status,
            liveness=liveness_res,
            readiness=readiness_res,
            startup=startup_res,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            trace_id=trace,
        )
