# ROADMAP STATE - 120-Day Automated Equity Research Engine

## 1. Project Context & Current Position
* **Current Day:** Day 66 Complete (Phase 2 Milestone 2 - In Progress)
* **Next Action:** Begin Day 67 — Write-Through Cache on Job Completion & `CachePrimeIndicator.tsx`
* **Target Role:** FinTech AI Automation Engineer / Systems Architect
* **Core Philosophy:** We strictly follow the principles outlined in "The 1% Advantage: Engineering a Durable FinTech Career".
* **AI Agent Directive:** Do not write black-box code or rewrite existing architecture. You are operating as a 1% Systems Architect. Read the completed days to understand the existing context, then execute strictly according to `canonical_roadmap.md` in `.agents/rules/`.

## 2. CANONICAL ROADMAP STRUCTURE (Source-Aligned)

```
Phase 1  (Days 1–60)   → Core Engine — LOCKED
Phase 2  (Days 61–65)  → Redis Streams & Message Brokers — LOCKED
Phase 2  (Days 66–70)  → Distributed Caching ← CURRENT
Phase 2  (Days 71–75)  → Quantitative Analytics (SMA, RSI, Bollinger)
Phase 2  (Days 76–80)  → Document Ingestion & RAG Pipelines (pgvector, 10-K/10-Q)
Phase 2  (Days 81–85)  → Stress Testing & Chaos Engineering (Locust)
Phase 2  (Days 86–90)  → Production Dry Run & Capstone Polish
Phase 3  (Days 91–100) → Live Cloud Orchestration (Render, Docker, Prometheus, Grafana)
Phase 3  (Days 101–110)→ Build in Public (LangGraph Visualizer, Loom, Portfolio)
Phase 3  (Days 111–120)→ US Founder Infiltration & Contract Seeding
```

> **Full day-by-day breakdown is in `.agents/rules/canonical_roadmap.md` — that file is the single source of truth.**

## 3. Locked & Completed Architecture (Days 1–60)
We have successfully engineered a zero-trust, cloud-native FinTech microservice pipeline.

**Backend & Compute Core (Phases 1 & 2):**
* Built a FastAPI asynchronous ingestion engine.
* Integrated a PostgreSQL time-series database for historical data persistence.
* Engineered a Redis-backed background worker queue to prevent ASGI thread starvation.
* Deployed a LangGraph multi-agent state machine that outputs deterministic ternary signals (BUY, SELL, INVALID).

**Security & Orchestration (Weeks 4 & 7):**
* Secured the perimeter with a Zero-Trust JWT authentication edge via a Next.js Backend-For-Frontend (BFF) proxy.
* Established an M2M (Machine-to-Machine) security bridge using `X-N8N-API-KEY` headers.
* Bootstrapped self-hosted `n8n` for autonomous multi-asset surveillance, cron scheduling, and Discord webhook alerting.

**Real-Time Presentation & Hardening Edge (Week 8 & Capstone, Days 50-60):**
* **Day 51:** Upgraded `IntelligenceCard.tsx` to display conditional Tailwind styling (green/red) and millisecond execution latency telemetry.
* **Day 53:** Engineered a client-side state machine in `ActionTriggers.tsx` enforcing a strict 60-second cooldown timer to prevent backend rate-limiter spam.
* **Day 54:** Eradicated the legacy HTTP polling loop and implemented a persistent, event-driven WebSocket architecture using a custom `useWebSocket.ts` hook and an O(1) in-memory backend `ConnectionManager`.
* **Day 55:** Hardened the WebSocket tunnel with a 30-second ping/pong heartbeat keep-alive, client-side circuit breakers (`MAX_RETRIES = 3`), and end-to-end `server_timestamp` latency benchmarking.
* **Day 56:** Fully implemented Multi-Asset Batch Orchestration: Pydantic V2 `BatchAnalysisRequest`, `asyncio.Semaphore(5)`, UUID mapping, pre-warmed Redis states, BFF proxy, `BatchCommandCenter.tsx`.
* **Day 57:** Hardened WebSocket packet integrity with monotonic sequence numbering, out-of-order frame rejection, and automated sequence gap recovery triggers.
* **Day 58:** Hardened Next.js 15 App Router BFF authentication pipeline with `NextResponse.cookies.set()`.
* **Day 59:** Shipped Structured Telemetry & Live Job Audit Registry: UUID `request_id`, service domain classification, sub-millisecond `perf_counter`, CQRS `GET /v1/intelligence/audit`, `JobAuditPanel.tsx`.
* **Day 60:** Phase 1 Capstone — `audit_system.py` 7/7 pass. Phase 1 formally signed off and locked.

## 4. Phase 2 Milestone 1 — Redis Streams (Days 61–65) — LOCKED

* **Day 61:** Redis Streams broker (`app/core/broker.py`), `intel_workers_group`, `StreamConsumerWorker` daemon. `audit_broker.py` 5/5 pass.
* **Day 62:** DLQ + poison-pill gatekeeper (`MAX_DELIVERY_ATTEMPTS=3`), `XAUTOCLAIM` crash recovery, Discord DLQ alerts, `GET /v1/intelligence/dlq`. `audit_recovery.py` 4/4 pass.
* **Day 63:** `get_stream_lag()`, `DynamicConcurrencyController` (auto-tunes Semaphore MIN=3/MAX=10 every 10s), `GET /v1/intelligence/stream-health`. `audit_lag_monitor.py` 4/4 pass.
* **Day 64:** `GroqLLMCircuitBreaker` (CLOSED/OPEN/HALF_OPEN), AWS full-jitter exponential backoff, concurrency clamping on 429, `GET /v1/intelligence/circuit-breaker`. `audit_retry_scheduler.py` 4/4 pass.
* **Day 65:** W3C `traceparent` compliant telemetry, `generate_trace_id/span_id/format_traceparent/parse_traceparent`, span lineage in Redis Streams + DLQ, worker dequeue span, `queue_wait_ms`, `GET /v1/intelligence/trace/{trace_id}`. `audit_distributed_tracing.py` 5/5 pass.
* **Frontend (Days 65–70):** `StreamHealthMonitor.tsx`, `CircuitBreakerPanel.tsx`, `DLQInspectorPanel.tsx`, `DistributedTraceExplorer.tsx`, `TraceWaterfallModal.tsx`.

Phase 2 Milestone 1 certified and sealed. Zero regressions across all prior suites.

## 5. Phase 2 Milestone 2 — Distributed Caching & Read Optimization (Days 66–70)

* **Day 66:** Cache-Aside Read Optimization Layer & Real-Time Status Telemetry:
  * Engineered `CacheAsideManager` (`app/core/cache.py`) supporting non-blocking Redis GET queries on `cache:intel:{ticker}`, automatic fallback to PostgreSQL time-series storage upon miss, automated 300s TTL cache priming, and explicit eviction (`invalidate`).
  * Mounted CQRS read endpoints `GET /v1/intelligence/results/{ticker}` (with optional `?refresh=true`) and administrative cache eviction `POST /v1/intelligence/cache/invalidate/{ticker}`.
  * Shipped Next.js 15 App Router BFF proxy `GET /api/results/[ticker]` with cookie-forwarded bearer JWT token.
  * Engineered and integrated `CacheStatusBadge.tsx` into `IntelligenceCard.tsx` and the research dashboard, rendering live 🟢 Cache Hit (Redis) vs 🟡 DB Read (PostgreSQL), dynamic client-side TTL countdown timer, and source latency telemetry.
  * Executed automated 5-point audit suite (`audit_cache_aside.py`) with 100% pass rate (5/5 assertions: cold miss, auto-prime, warm hit, invalidation, operational regressions) and 0 regressions on Day 65 distributed tracing audit.

## 6. INVARIANT CONSTRAINTS — Never Violate

* **Do not regress:** Zero-trust Pydantic perimeter, WebSocket sequence validation, adaptive concurrency control, distributed telemetry tracing.
* **Protect the Event Loop:** Retain strict async I/O boundaries. No blocking calls in hot paths.
* **LLM never does math:** All quantitative metrics (SMA, RSI, Bollinger) must be computed in PostgreSQL and passed as pre-calculated deterministic numbers to LangGraph.
* **pgvector on existing PostgreSQL only:** No new database services for RAG. One Alembic migration.
* **Every day = Backend + Frontend.** No day ends without both a backend feature and a frontend visual.
* **All audit scripts must pass at 100%** before moving to the next day.