import json
import logging
from pathlib import Path
from typing import Any, Dict
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

logger = logging.getLogger("openapi_spec")

OPENAPI_TITLE = "Automated Equity Research Engine — Intelligence Gateway API"
OPENAPI_VERSION = "0.9.0"
OPENAPI_SUMMARY = (
    "Production-grade, high-throughput asynchronous fintech gateway providing deterministic "
    "equity research, real-time quantitative time-series analytics, qualitative SEC EDGAR RAG, "
    "and zero-trust microservice orchestration."
)

OPENAPI_DESCRIPTION = """
# Automated Equity Research Engine API Specification

Welcome to the enterprise API reference for the **Automated Equity Research Engine Intelligence Gateway**.
This high-performance async gateway is designed for institutional-grade financial intelligence, algorithmic signal generation, and quantitative risk modeling.

---

## 🏛️ Architectural Pillars

1. **Deterministic Quantitative Analytics:**
   - Pre-computed in PostgreSQL using pure mathematical window functions (`SMA`, `EMA`, `VWAP`, `RSI-14`, `Bollinger Bands`, `Sharpe Ratio`, `Correlation Matrix`).
   - Strictly enforces the foundational rule: *LLM never does math*.
2. **Asynchronous Stream Broker & Workers:**
   - Powered by Redis Streams (`XADD`, `XREADGROUP`, `XAUTOCLAIM`) with dead-letter queue (DLQ) quarantine.
   - Prevents ASGI thread pool starvation by offloading long-running multi-agent reasoning to background worker processes.
3. **Qualitative SEC EDGAR RAG Engine:**
   - Ingests 10-K and 10-Q corporate disclosures into 1536-dimensional L2-normalized vector embeddings.
   - Cosine and lexical semantic search with HNSW indexes in `pgvector` for verifiable provenance and citations.
4. **Multi-Agent State Machine:**
   - Built on LangGraph to synthesize technical quantitative signals and qualitative filing excerpts into deterministic alpha recommendations (`BUY`, `SELL`, `HOLD`, `INVALID`).
5. **Zero-Trust Perimeter Security & Observability:**
   - Enforces HMAC-SHA256 JWT tokens and M2M orchestration headers (`X-N8N-API-KEY`).
   - Distributed W3C `traceparent` context propagation across all HTTP, WebSocket, and Redis Stream interactions.

---

## 🔐 Authentication & Access Control

The gateway supports two authorization mechanisms:

| Scheme | Type | Header | Target Consumer |
| :--- | :--- | :--- | :--- |
| **BearerAuth** | HTTP Bearer (JWT) | `Authorization: Bearer <token>` | Web Dashboard Users & Interactive Clients |
| **ApiKeyAuth** | API Key | `X-N8N-API-KEY: <internal_key>` | Internal Automation Daemons & n8n Workflows |

---

## 🚦 Rate Limiting & Fault Tolerance

- Perimeter rate limiting is enforced via a sliding-window counter (default: 5 requests/minute for protected endpoints).
- When downstream LLM quotas are throttled, an autonomous AWS-style full-jitter backoff and circuit breaker clamps concurrency to protect system stability.
"""

TAGS_METADATA = [
    {
        "name": "Authentication & Perimeter Security",
        "description": "Zero-trust session authorization, JWT verification, and user management.",
    },
    {
        "name": "Intelligence & Agentic Orchestration",
        "description": "LangGraph multi-agent financial research, single-asset and multi-asset batch analysis jobs.",
    },
    {
        "name": "Quantitative Time-Series Analytics",
        "description": "PostgreSQL window-function calculations: SMA, RSI, Bollinger Bands, Volatility, Sharpe Ratio, and Composite Technical Signal Fusion.",
    },
    {
        "name": "Market Data Ingestion & Streaming",
        "description": "Historical and live OHLCV price ingestion via yfinance with WebSocket broadcasting.",
    },
    {
        "name": "Document Ingestion & Qualitative RAG",
        "description": "PDF recursive chunking, SEC EDGAR filing ingestion, pgvector semantic search, and citation retrieval.",
    },
    {
        "name": "Chaos Engineering & Resilience",
        "description": "High-throughput Locust load testing, connection pool stress, Redis memory pressure, and event-loop latency benchmarking.",
    },
    {
        "name": "Regression Auditing & Verification",
        "description": "Continuous verification runner evaluating 33 institutional assertions across all 5 milestones.",
    },
    {
        "name": "System Architecture & Topology",
        "description": "Inspect 7-tier microservice architecture nodes, directed data flow graph, and Mermaid blueprints.",
    },
    {
        "name": "Code Quality & Static Analysis",
        "description": "Ruff linter compliance, AST syntax parsing verification, and codebase metric governance.",
    },
    {
        "name": "System Telemetry & Health Probes",
        "description": "Cloud load balancer liveness probes, readiness checks, and administration seeds.",
    },
]


def custom_openapi(app: FastAPI) -> Dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=OPENAPI_TITLE,
        version=OPENAPI_VERSION,
        summary=OPENAPI_SUMMARY,
        description=OPENAPI_DESCRIPTION,
        routes=app.routes,
        tags=TAGS_METADATA,
    )

    # Security schemes definition
    if "components" not in openapi_schema:
        openapi_schema["components"] = {}

    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Provide JWT session token obtained via POST /v1/auth/login",
        },
        "ApiKeyAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "X-N8N-API-KEY",
            "description": "Internal orchestration API key for machine-to-machine pipelines",
        },
    }

    # Standard enterprise response error definitions
    openapi_schema["components"]["responses"] = {
        "BadRequestError": {
            "description": "Invalid payload format, schema constraint violation, or perimeter firewall rejection.",
            "content": {
                "application/json": {
                    "example": {
                        "status": "blocked",
                        "error_type": "DataFirewallViolation",
                        "details": [{"field": "ticker", "issue": "Field required"}],
                    }
                }
            },
        },
        "UnauthorizedError": {
            "description": "Missing, expired, or invalid authorization credentials.",
            "content": {"application/json": {"example": {"detail": "Missing or invalid authorization credentials"}}},
        },
        "RateLimitError": {
            "description": "Request volume exceeds sliding-window rate limit threshold.",
            "content": {
                "application/json": {
                    "example": {
                        "status": "blocked",
                        "error": "Rate limit exceeded. Maximum 5 requests per minute allowed.",
                        "retry_after_seconds": 60,
                    }
                }
            },
        },
        "InternalServerError": {
            "description": "Internal service execution error with W3C trace tracking context.",
            "content": {
                "application/json": {
                    "example": {
                        "status": "error",
                        "message": "Internal worker error",
                        "trace_id": "9b1deb4d3b7d4bad9bdd2b0d7b3dcb6d",
                    }
                }
            },
        },
    }

    app.openapi_schema = openapi_schema
    return app.openapi_schema


def export_openapi_json(app: FastAPI, output_paths: list[str | Path]) -> dict:
    schema = custom_openapi(app)
    for p in output_paths:
        target_path = Path(p).resolve()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2)
        logger.info(f"✅ Exported OpenAPI specification to {target_path}")
    return schema
