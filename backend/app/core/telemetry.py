import time
import json
import uuid
import sys
import secrets
from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

# Paths that must never emit log lines — avoids drowning signal in liveness probe noise.
SILENT_PATHS: frozenset[str] = frozenset({"/health", "/healthz"})


# ======================================================================
# DISTRIBUTED TRACING PRIMITIVES (W3C TRACECONTEXT COMPLIANT)
# ======================================================================

def generate_trace_id() -> str:
    """
    Generates a 32-character hexadecimal trace identifier conforming to
    W3C TraceContext specifications.
    """
    return uuid.uuid4().hex


def generate_span_id() -> str:
    """
    Generates a 16-character hexadecimal span identifier conforming to
    W3C TraceContext specifications.
    """
    return secrets.token_hex(8)


def format_traceparent(trace_id: str, span_id: str) -> str:
    """
    Serializes a trace_id and span_id into a standard W3C traceparent header:
    version(00) - trace_id(32) - span_id(16) - trace_flags(01)
    """
    clean_trace = trace_id.replace("-", "").lower()
    clean_span = span_id.replace("-", "").lower()
    return f"00-{clean_trace[:32].zfill(32)}-{clean_span[:16].zfill(16)}-01"


def parse_traceparent(header_value: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Parses a W3C traceparent header string into its constituent (trace_id, parent_span_id).
    Returns (None, None) if the header is missing or malformed.
    """
    if not header_value or not isinstance(header_value, str):
        return None, None

    parts = header_value.strip().split("-")
    if len(parts) >= 3 and len(parts[1]) == 32:
        return parts[1], parts[2]
    return None, None


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Structured Telemetry Middleware with Distributed TraceContext Propagation.

    Instruments incoming HTTP requests to emit structured JSON logs with
    traceable request and span IDs, service domain route classifications,
    and sub-millisecond execution latency metrics.
    Propagates W3C traceparent and X-Request-ID response headers for cross-service tracing.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # --- Fail-Silent Path Filter ---
        if path in SILENT_PATHS:
            return await call_next(request)

        # --- Distributed Context Extraction / Generation ---
        # 1. Attempt extraction from W3C 'traceparent' header
        traceparent_header = request.headers.get("traceparent")
        extracted_trace, parent_span = parse_traceparent(traceparent_header)

        # 2. Fallback to proprietary correlation headers or generate new root trace
        trace_id = (
            extracted_trace
            or request.headers.get("X-Trace-ID")
            or request.headers.get("X-Request-ID")
            or request.headers.get("X-Correlation-ID")
            or generate_trace_id()
        )
        span_id = generate_span_id()

        # Attach context to request state for downstream handlers
        request.state.trace_id = trace_id
        request.state.span_id = span_id
        request.state.parent_span_id = parent_span
        request.state.request_id = trace_id

        # Measure request execution latency
        start = time.perf_counter()
        response = await call_next(request)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)

        # --- Route Classification ---
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
            "trace_id": trace_id,
            "span_id": span_id,
            "parent_span_id": parent_span,
            "request_id": trace_id,
            "timestamp_iso": datetime.now(timezone.utc).isoformat(),
            "client_ip": request.client.host if request.client else "unknown",
            "method": request.method,
            "path": path,
            "route_class": route_class,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
        }

        # Write directly to stdout for log aggregators
        sys.stdout.write(json.dumps(log_payload) + "\n")
        sys.stdout.flush()

        # --- Inject Cross-Service Trace Headers ---
        response.headers["X-Request-ID"] = trace_id
        response.headers["X-Trace-ID"] = trace_id
        response.headers["traceparent"] = format_traceparent(trace_id, span_id)

        return response