# ROADMAP STATE - 120-Day Automated Equity Research Engine

## 1. Project Context & Current Position
* **Current Day:** Day 62 (Phase 2 - Day 62 Locked)
* **Target Role:** FinTech AI Automation Engineer / Systems Architect[cite: 14]
* **Core Philosophy:** We strictly follow the principles outlined in "The 1% Advantage: Engineering a Durable FinTech Career". 
* **AI Agent Directive:** Do not write black-box code or rewrite existing architecture. You are operating as a 1% Systems Architect. Read the completed days to understand the existing context, then execute the Phase 2 objectives.

## 2. Locked & Completed Architecture (Days 1-60)
We have successfully engineered a zero-trust, cloud-native FinTech microservice pipeline. 

**Backend & Compute Core (Phases 1 & 2):**
* Built a FastAPI asynchronous ingestion engine[cite: 13].
* Integrated a PostgreSQL time-series database for historical data persistence[cite: 13].
* Engineered a Redis-backed background worker queue to prevent ASGI thread starvation[cite: 13].
* Deployed a LangGraph multi-agent state machine that outputs deterministic ternary signals (BUY, SELL, INVALID)[cite: 4, 13].

**Security & Orchestration (Weeks 4 & 7):**
* Secured the perimeter with a Zero-Trust JWT authentication edge via a Next.js Backend-For-Frontend (BFF) proxy[cite: 10, 13].
* Established an M2M (Machine-to-Machine) security bridge using `X-N8N-API-KEY` headers[cite: 12].
* Bootstrapped self-hosted `n8n` for autonomous multi-asset surveillance, cron scheduling, and Discord webhook alerting[cite: 7, 19].

**Real-Time Presentation & Hardening Edge (Week 8 & Capstone, Days 50-60):**
* **Day 51:** Upgraded `IntelligenceCard.tsx` to display conditional Tailwind styling (green/red) and millisecond execution latency telemetry[cite: 8].
* **Day 53:** Engineered a client-side state machine in `ActionTriggers.tsx` enforcing a strict 60-second cooldown timer to prevent backend rate-limiter spam[cite: 8].
* **Day 54:** Eradicated the legacy HTTP polling loop and implemented a persistent, event-driven WebSocket architecture using a custom `useWebSocket.ts` hook and an O(1) in-memory backend `ConnectionManager`[cite: 2].
* **Day 55:** Hardened the WebSocket tunnel with a 30-second ping/pong heartbeat keep-alive, client-side circuit breakers (`MAX_RETRIES = 3`), and end-to-end `server_timestamp` latency benchmarking[cite: 2].
* **Day 56:** Fully implemented Multi-Asset Batch Orchestration:
  * Pydantic V2 `BatchAnalysisRequest` zero-trust perimeter with smart filtration (1-50 assets).
  * Controlled backend concurrency worker pool using `asyncio.Semaphore(5)` to prevent LLM rate limits and thread starvation on `POST /v1/intelligence/batch`.
  * Unique UUID mapping and pre-warmed Redis states for real-time WebSocket stream binding.
  * Secure Next.js BFF proxy route (`POST /api/jobs/batch`) injecting JWT Bearer tokens.
  * `ActionTriggers.tsx` batch presets/custom input and `BatchCommandCenter.tsx` real-time progress matrix bound to the 60-second cooldown rate limiter.
* **Day 57:** Hardened WebSocket packet integrity with monotonic sequence numbering (`sequence_number`), out-of-order frame rejection, and automated sequence gap recovery triggers.
* **Day 58:** Hardened the Next.js 15 App Router BFF authentication pipeline by transitioning cookie mutations from read-only headers to outgoing `NextResponse.cookies.set()`.
* **Day 59:** Shipped Structured Telemetry & Live Job Audit Registry:
  * Upgraded ASGI telemetry middleware with UUID `request_id`, service domain route classification (`INTELLIGENCE`, `MARKET`, `AUTH`), sub-millisecond `perf_counter` latency, and `X-Request-ID` response headers.
  * Added CQRS read route `GET /v1/intelligence/audit` powered by non-blocking Redis `SCAN` cursor iteration and pipelined batch retrieval (zero PostgreSQL load).
  * Built real-time `JobAuditPanel.tsx` operational console with automatic 5s countdown polling, status badges, and SSR hydration mismatch safety.
* **Day 60:** Phase 1 Capstone Live-Fire System Audit:
  * Executed automated 7-point audit suite (`audit_system.py`) verifying PostgreSQL, Redis, Telemetry headers, Pydantic Data Firewall, Bcrypt JWT Auth, CQRS Live Audit, and Semaphore Concurrency Fan-Out.
  * 100% test pass rate (7/7 assertions verified).
  * Phase 1 formally signed off and locked.
* **Day 61:** Advanced Message Brokers & Redis Streams Migration:
  * Engineered enterprise broker abstraction in `app/core/broker.py` with idempotent consumer group bootstrapping (`intel_workers_group` on `stream:intel_jobs`).
  * Converted FastAPI endpoints (`POST /v1/intelligence/jobs/{ticker}` and `POST /v1/intelligence/batch`) into pure, non-blocking stream publishers (`XADD`), eliminating ASGI `BackgroundTasks` thread starvation.
  * Engineered standalone async `StreamConsumerWorker` daemon (`app/workers/consumer.py`) with consumer group concurrency limits, explicit acknowledgment (`XACK`), and zero PEL leakage.
  * Added dedicated `worker` service container in `docker-compose.yml` with embedded lifespan fallback.
  * Executed automated 5-point audit suite (`audit_broker.py`) and verified 100% test pass rate (5/5 assertions passed) alongside 7/7 Phase 1 regression assertions.
* **Day 62:** Consumer Crash Recovery & Dead-Letter Queue (DLQ) Integration:
  * Engineered autonomous crash recovery using `XAUTOCLAIM` (`reclaim_abandoned_jobs` in `app/core/broker.py`) to safely steal orphaned PEL jobs from dead or frozen workers after a 30s idle timeout.
  * Implemented poison pill gatekeeper (`MAX_DELIVERY_ATTEMPTS = 3`) quarantine system in `app/workers/consumer.py`. Toxic payloads exceeding the threshold are cleanly routed to `stream:intel_jobs:dlq` and purged from the primary stream with `XACK`.
  * Integrated external Dead-Letter alerting with Discord/n8n DLQ webhook notifications.
  * Built public CQRS observability endpoint `GET /v1/intelligence/dlq` exposing diagnostic root-cause metadata and delivery attempt counts.
  * Executed automated 4-point audit suite (`audit_recovery.py`) and verified 100% test pass rate (4/4 assertions passed) with zero main stream PEL residual leaks.

## 3. Current Position: Day 62 Complete & Locked (Ready for Day 63)
Phase 2 fault tolerance is certified. The system autonomously recovers from worker container crashes, isolates poison pill data, and prevents infinite retry loops.

## 4. Phase 2 Directives (Days 61–90)
* **Current Milestone (Days 61–65):** Advanced Message Brokers & Resilient Stream Processing.
* **Day 63 Target:** Stream Lag Monitoring & Worker Autoscaling / Dynamic Concurrency Tuning.
* **Do not regress:** Preserve zero-trust Pydantic perimeter, WebSocket sequence validation, and telemetry tracing.
* **Protect the Event Loop:** Retain strict async I/O boundaries and non-blocking caching.