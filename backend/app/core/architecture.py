from datetime import datetime, timezone
from typing import Optional

from app.core.telemetry import generate_trace_id
from app.database.schemas import (
    ArchitectureEdge,
    ArchitectureNode,
    ArchitectureSubsystem,
    SystemArchitectureTopology,
)

MERMAID_BLUEPRINT = """graph TD
    %% Styling & Theme Classes
    classDef clientClass fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef edgeClass fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#f8fafc;
    classDef gatewayClass fill:#022c22,stroke:#34d399,stroke-width:2px,color:#f8fafc;
    classDef streamClass fill:#450a0a,stroke:#f87171,stroke-width:2px,color:#f8fafc;
    classDef workerClass fill:#3b0764,stroke:#c084fc,stroke-width:2px,color:#f8fafc;
    classDef langgraphClass fill:#172554,stroke:#60a5fa,stroke-width:2px,color:#f8fafc;
    classDef storageClass fill:#1e293b,stroke:#94a3b8,stroke-width:2px,color:#f8fafc;
    classDef cacheClass fill:#422006,stroke:#fbbf24,stroke-width:2px,color:#f8fafc;
    classDef wsClass fill:#134e4a,stroke:#2dd4bf,stroke-width:2px,color:#f8fafc;

    subgraph PresentationTier ["1. Presentation & Edge Tier"]
        Client["🖥️ Trading Dashboard<br/><i>React 19 · Next.js 15 · Tailwind</i>"]:::clientClass
        BFF["🛡️ BFF Proxy Edge<br/><i>Next.js App Router · Zero-Trust JWT</i>"]:::edgeClass
    end

    subgraph IngestionTier ["2. Ingestion & Perimeter Defense"]
        Gateway["⚡ Async API Gateway<br/><i>FastAPI · Structured Telemetry · RateLimiter</i>"]:::gatewayClass
        Cache["💾 Distributed Cache-Aside<br/><i>Redis · Mutex Stampede Guard</i>"]:::cacheClass
    end

    subgraph MessageBrokerTier ["3. Event Streaming & Work Queues"]
        StreamBroker["📬 Redis Streams Broker<br/><i>stream:intel_jobs · PEL Tracking</i>"]:::streamClass
        DLQ["☣️ Poison-Pill DLQ<br/><i>3-Attempt Quarantine</i>"]:::streamClass
    end

    subgraph ComputeTier ["4. Background Worker Daemon Pool"]
        WorkerPool["⚙️ Stream Consumer Workers<br/><i>Asyncio Daemon · XAUTOCLAIM Self-Healing</i>"]:::workerClass
        EDGAR["📚 SEC EDGAR Ingest Daemon<br/><i>Autonomous 10-K/10-Q Poller</i>"]:::workerClass
    end

    subgraph IntelligenceTier ["5. Multi-Agent Reasoning & Qualitative RAG"]
        LangGraph["🧬 LangGraph State Machine<br/><i>Quantitative + Qualitative Fusion</i>"]:::langgraphClass
        PgVector["🔍 pgvector Knowledge Base<br/><i>1536-dim HNSW Cosine Index</i>"]:::storageClass
    end

    subgraph QuantitativeTier ["6. Deterministic Time-Series Engine"]
        Postgres["🏛️ PostgreSQL Core DB<br/><i>Window Functions: SMA/EMA/VWAP/RSI/Bollinger/Sharpe</i>"]:::storageClass
    end

    subgraph TelemetryTier ["7. Real-Time Telemetry & WebSocket Dispatch"]
        WSManager["📡 WebSocket ConnectionManager<br/><i>Monotonic Sequences · Gap Recovery</i>"]:::wsClass
    end

    %% Data Flow Connections
    Client -->|HTTP / Cookies JWT| BFF
    BFF -->|Internal Zero-Trust REST| Gateway
    Gateway -->|XADD Async Ingest| StreamBroker
    Gateway -.->|Cache-Aside Read & Mutex| Cache
    Gateway -.->|CQRS Read Queries| Postgres
    StreamBroker -->|XREADGROUP Consumer Group| WorkerPool
    StreamBroker -.->|Max Retries Exceeded| DLQ
    WorkerPool -->|Invoke State Machine| LangGraph
    EDGAR -->|Batch Embeddings| PgVector
    LangGraph -->|Deterministic Math| Postgres
    LangGraph -->|Semantic Passage Search| PgVector
    WorkerPool -->|Write-Through Prime| Cache
    WorkerPool -->|Broadcast Completion| WSManager
    WSManager -->|Push Monotonic Frames| Client
    Client <-->|Keep-Alive Heartbeat| WSManager
"""


class SystemArchitectureRegistry:
    @staticmethod
    def get_topology(trace_id: Optional[str] = None) -> SystemArchitectureTopology:
        t_id = trace_id or generate_trace_id()

        subsystems = [
            ArchitectureSubsystem(
                id="presentation",
                title="Presentation & BFF Security Edge",
                description="Next.js 15 App Router frontend with React 19, zero-trust session cookies, and dedicated BFF proxy.",
                nodes=[
                    ArchitectureNode(
                        id="client_ui",
                        name="Trading Dashboard & Operations Console",
                        subsystem="presentation",
                        tech_stack="React 19, Next.js 15, Tailwind CSS, Lightweight Charts",
                        role="User visualization, WebSocket telemetry reception, interactive parameter tuning",
                        protocol="HTTP/HTTPS & WSS",
                        latency_sla_ms=16.6,
                    ),
                    ArchitectureNode(
                        id="bff_proxy",
                        name="Next.js Backend-For-Frontend Edge",
                        subsystem="presentation",
                        tech_stack="Next.js Route Handlers, Node.js HTTP runtime",
                        role="Secure cookie-to-bearer token transformation, edge rate limit defense, CSRF mitigation",
                        protocol="HTTPS to Internal Gateway",
                        latency_sla_ms=15.0,
                    ),
                ],
            ),
            ArchitectureSubsystem(
                id="gateway",
                title="API Gateway & Ingestion Firewall",
                description="FastAPI ASGI ingestion core with structured JSON logging, sliding-window limiter, and CQRS query endpoints.",
                nodes=[
                    ArchitectureNode(
                        id="fastapi_gateway",
                        name="Async API Gateway Core",
                        subsystem="gateway",
                        tech_stack="FastAPI, Pydantic V2, Starlette, Uvicorn",
                        role="Request sanitization, payload schema validation, distributed trace generation, CQRS routing",
                        protocol="HTTP/2 & ASGI",
                        latency_sla_ms=25.0,
                    ),
                    ArchitectureNode(
                        id="rate_limiter",
                        name="Sliding-Window Rate Limiter",
                        subsystem="gateway",
                        tech_stack="Redis Sorted Sets (ZSET), Lua atomic pipeline",
                        role="Perimeter flood protection and per-client RPM enforcement",
                        protocol="Redis TCP Protocol",
                        latency_sla_ms=2.0,
                    ),
                ],
            ),
            ArchitectureSubsystem(
                id="broker",
                title="Distributed Message Broker & Streaming",
                description="Redis Streams persistent message log with consumer group orchestration, pending entry list tracking, and DLQ.",
                nodes=[
                    ArchitectureNode(
                        id="redis_streams",
                        name="Redis Streams Event Broker",
                        subsystem="broker",
                        tech_stack="Redis 7.x Streams (stream:intel_jobs), Consumer Groups",
                        role="Persistent decoupled task buffering, at-least-once delivery, consumer offset management",
                        protocol="Redis Stream Protocol (XADD/XREADGROUP)",
                        latency_sla_ms=1.5,
                    ),
                    ArchitectureNode(
                        id="dead_letter_queue",
                        name="Poison-Pill Dead-Letter Queue (DLQ)",
                        subsystem="broker",
                        tech_stack="Redis Stream (stream:intel_dlq)",
                        role="Isolation and quarantine of tasks failing after MAX_DELIVERY_ATTEMPTS=3",
                        protocol="Redis Stream Protocol",
                        latency_sla_ms=2.0,
                    ),
                ],
            ),
            ArchitectureSubsystem(
                id="workers",
                title="Asynchronous Worker Daemon Pool",
                description="Autonomous background compute pool with dynamic concurrency regulation and crash recovery.",
                nodes=[
                    ArchitectureNode(
                        id="stream_consumer_worker",
                        name="Stream Consumer Daemon",
                        subsystem="workers",
                        tech_stack="Python asyncio, DynamicConcurrencyController (Semaphore 3-10)",
                        role="Dequeuing stream jobs, invoking LangGraph state machine, write-through caching, WebSocket dispatch",
                        protocol="Async Coroutine Pool",
                        latency_sla_ms=500.0,
                    ),
                    ArchitectureNode(
                        id="edgar_worker",
                        name="SEC EDGAR Ingestion Daemon",
                        subsystem="workers",
                        tech_stack="SEC EDGAR REST, pypdf, Regex Text Sanitizer",
                        role="Autonomous 10-K/10-Q corporate filing polling, recursive chunking, and pgvector storage",
                        protocol="Async HTTP & PostgreSQL",
                        latency_sla_ms=1500.0,
                    ),
                ],
            ),
            ArchitectureSubsystem(
                id="intelligence",
                title="Multi-Agent AI & Quantitative Signal Fusion",
                description="LangGraph multi-agent cognitive architecture combining qualitative 10-K RAG with deterministic PostgreSQL math.",
                nodes=[
                    ArchitectureNode(
                        id="langgraph_state_machine",
                        name="LangGraph Multi-Agent Engine",
                        subsystem="intelligence",
                        tech_stack="LangGraph, LangChain Core, Groq LLM API",
                        role="State machine orchestration: fetch data -> quant compute -> RAG retrieve -> fusion -> gatekeeper",
                        protocol="In-Memory State Transitions",
                        latency_sla_ms=800.0,
                    ),
                    ArchitectureNode(
                        id="pgvector_search",
                        name="pgvector Hybrid Semantic Retrieval",
                        subsystem="intelligence",
                        tech_stack="PostgreSQL pgvector extension, 1536-dim embeddings, HNSW index",
                        role="Cosine distance semantic passage ranking + lexical keyword hybrid scoring",
                        protocol="SQL Vector Distance (<->)",
                        latency_sla_ms=35.0,
                    ),
                ],
            ),
            ArchitectureSubsystem(
                id="storage",
                title="Deterministic Time-Series & Persistence Layer",
                description="PostgreSQL relational database computing exact quantitative indicators with zero LLM math hallucinations.",
                nodes=[
                    ArchitectureNode(
                        id="postgres_quant",
                        name="PostgreSQL Quantitative Engine",
                        subsystem="storage",
                        tech_stack="PostgreSQL 16, SQLAlchemy 2.0 Async, asyncpg",
                        role="Time-series persistence, SQL window functions (SMA, EMA, VWAP, RSI, Bollinger Bands, Sharpe)",
                        protocol="Async PostgreSQL Connection Pool",
                        latency_sla_ms=20.0,
                    ),
                    ArchitectureNode(
                        id="redis_cache",
                        name="Distributed Cache-Aside & Stampede Guard",
                        subsystem="storage",
                        tech_stack="Redis In-Memory Key-Value, Distributed Mutex Lock (SET NX EX)",
                        role="Sub-millisecond read optimization for cached intelligence, stampede collapse",
                        protocol="Redis Key-Value Commands",
                        latency_sla_ms=0.8,
                    ),
                ],
            ),
            ArchitectureSubsystem(
                id="telemetry",
                title="Real-Time Telemetry & WebSocket Dispatch",
                description="Sub-millisecond packet broadcasting with monotonic sequence validation, gap detection, and W3C tracing.",
                nodes=[
                    ArchitectureNode(
                        id="websocket_manager",
                        name="WebSocket Broadcast ConnectionManager",
                        subsystem="telemetry",
                        tech_stack="FastAPI WebSockets, Python In-Memory Connection Registry",
                        role="Real-time multi-tenant broadcast, monotonic sequence numbering, keep-alive heartbeat",
                        protocol="WebSocket (RFC 6455)",
                        latency_sla_ms=5.0,
                    ),
                    ArchitectureNode(
                        id="distributed_tracing",
                        name="W3C Distributed Tracing Middleware",
                        subsystem="telemetry",
                        tech_stack="W3C traceparent (Trace-ID + Span-ID), Structured Logging",
                        role="End-to-end request correlation across HTTP, Redis Streams, Worker, DB, and WebSockets",
                        protocol="W3C Trace Context Specification",
                        latency_sla_ms=0.2,
                    ),
                ],
            ),
        ]

        edges = [
            ArchitectureEdge(
                source="client_ui",
                target="bff_proxy",
                protocol="HTTP",
                description="Client HTTP requests with session cookie",
                is_async=True,
            ),
            ArchitectureEdge(
                source="client_ui",
                target="websocket_manager",
                protocol="WS",
                description="Bidirectional WebSocket keep-alive ping/pong & sequence validation",
                is_async=True,
            ),
            ArchitectureEdge(
                source="bff_proxy",
                target="fastapi_gateway",
                protocol="HTTP",
                description="Zero-trust internal REST requests with Bearer JWT / M2M secret",
                is_async=True,
            ),
            ArchitectureEdge(
                source="fastapi_gateway",
                target="rate_limiter",
                protocol="IPC",
                description="Perimeter client request count verification via Redis ZSET",
                is_async=True,
            ),
            ArchitectureEdge(
                source="fastapi_gateway",
                target="redis_cache",
                protocol="IPC",
                description="Cache-aside read queries for completed equity research",
                is_async=True,
            ),
            ArchitectureEdge(
                source="fastapi_gateway",
                target="postgres_quant",
                protocol="SQL",
                description="CQRS analytical queries for price history and technical indicators",
                is_async=True,
            ),
            ArchitectureEdge(
                source="fastapi_gateway",
                target="redis_streams",
                protocol="REDIS_STREAM",
                description="XADD enqueue of single & batch intelligence requests",
                is_async=True,
            ),
            ArchitectureEdge(
                source="redis_streams",
                target="stream_consumer_worker",
                protocol="REDIS_STREAM",
                description="XREADGROUP task acquisition & XAUTOCLAIM crash recovery",
                is_async=True,
            ),
            ArchitectureEdge(
                source="redis_streams",
                target="dead_letter_queue",
                protocol="REDIS_STREAM",
                description="Automatic poison-pill isolation after 3 failed delivery attempts",
                is_async=True,
            ),
            ArchitectureEdge(
                source="stream_consumer_worker",
                target="langgraph_state_machine",
                protocol="IPC",
                description="Multi-agent state machine invocation with dynamic concurrency control",
                is_async=True,
            ),
            ArchitectureEdge(
                source="langgraph_state_machine",
                target="postgres_quant",
                protocol="SQL",
                description="Retrieval of deterministic quantitative signals (SMA, RSI, Bollinger)",
                is_async=True,
            ),
            ArchitectureEdge(
                source="langgraph_state_machine",
                target="pgvector_search",
                protocol="SQL",
                description="Semantic cosine search across SEC 10-K/10-Q filing chunks",
                is_async=True,
            ),
            ArchitectureEdge(
                source="edgar_worker",
                target="pgvector_search",
                protocol="SQL",
                description="Batch insertion of sliding-window chunks with 1536-dim embeddings",
                is_async=True,
            ),
            ArchitectureEdge(
                source="stream_consumer_worker",
                target="redis_cache",
                protocol="IPC",
                description="Write-through cache priming upon job completion",
                is_async=True,
            ),
            ArchitectureEdge(
                source="stream_consumer_worker",
                target="websocket_manager",
                protocol="IPC",
                description="Emitting completed analysis payloads to WebSocket broadcast manager",
                is_async=True,
            ),
            ArchitectureEdge(
                source="websocket_manager",
                target="client_ui",
                protocol="WS",
                description="Broadcasting monotonic JSON frames to connected frontend dashboards",
                is_async=True,
            ),
        ]

        return SystemArchitectureTopology(
            system_name="Automated Equity Research Engine",
            version="v0.9.0-rc",
            status="OPERATIONAL",
            subsystems=subsystems,
            edges=edges,
            mermaid_diagram=MERMAID_BLUEPRINT,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            trace_id=t_id,
        )
