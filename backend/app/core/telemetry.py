import time
import json
import uuid
import sys
from datetime import datetime, timezone
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

# Paths that must never emit log lines — avoids drowning signal in liveness probe noise.
# Cloud load balancers (Render, GKE) fire /healthz every 10s — that is 8,640 junk lines/day.
SILENT_PATHS: frozenset[str] = frozenset({"/health", "/healthz"})


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Structured Telemetry Middleware.

    Instruments incoming HTTP requests to emit structured JSON logs with
    traceable request IDs, service domain route classifications, and latency metrics.
    Also propagates the X-Request-ID response header for cross-service tracing.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # --- Fail-Silent Path Filter ---
        # Health probe paths bypass all instrumentation to keep log streams clean.
        if path in SILENT_PATHS:
            return await call_next(request)

        # --- Request Tracing ---
        # Each request gets a unique UUID that links the log line to the
        # X-Request-ID response header, enabling end-to-end trace correlation
        # across FastAPI → Next.js BFF → browser DevTools.
        request_id = str(uuid.uuid4())

        # perf_counter gives sub-millisecond precision; time.time() only gives ~ms
        start = time.perf_counter()
        response = await call_next(request)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)

        # --- Route Classification ---
        # Tags each log line so dashboards (CloudWatch, Grafana) can filter by
        # service domain without parsing the raw path string.
        if "/intelligence" in path:
            route_class = "INTELLIGENCE"
        elif "/market" in path:
            route_class = "MARKET"
        elif "/auth" in path:
            route_class = "AUTH"
        elif "/ws" in path:
            route_class = "WEBSOCKET"
        elif "/analytics" in path:
            route_class = "ANALYTICS"
        else:
            route_class = "SYSTEM"

        # --- Structured JSON Log Emission ---
        log_payload = {
            "request_id": request_id,
            "timestamp_iso": datetime.now(timezone.utc).isoformat(),
            "client_ip": request.client.host if request.client else "unknown",
            "method": request.method,
            "path": path,
            "route_class": route_class,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
        }

        # Write directly to stdout — bypasses Uvicorn's formatter
        # and ensures clean JSON lines for log aggregators (Datadog, CloudWatch Insights)
        sys.stdout.write(json.dumps(log_payload) + "\n")
        sys.stdout.flush()

        # --- Inject Trace Header ---
        # Attaches the request_id to every HTTP response so the browser,
        # Next.js BFF, and any upstream proxy can correlate this request
        # without parsing log files.
        response.headers["X-Request-ID"] = request_id

        return response