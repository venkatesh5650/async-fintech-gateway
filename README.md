# ⚡ Alpha Sentinel: Autonomous FinTech Intelligence Engine

An enterprise-grade, event-driven trading intelligence platform built with Next.js, FastAPI, LangGraph, Redis, and PostgreSQL.

This repository demonstrates a production-grade approach to automated quantitative research. Instead of relying on vulnerable, single-prompt LLM scripts, this platform utilizes a deterministic **Multi-Agent State Machine** behind an **Asynchronous CQRS API Gateway** and a **Next.js Backend-For-Frontend (BFF) Proxy**. It is designed to ingest high-frequency data, evaluate financial schemas, and generate strict trading signals without blocking client UI threads.

## 🏗️ 6-Pillar Zero-Trust Architecture

Most financial AI applications crash in production because they lack stateful memory, defensive routing, and network safeguards. This engine is built on a 6-pillar architecture:

1. **Edge Security Proxy (Next.js BFF):** Intercepts client requests at the edge, injects zero-trust JWT clearances server-side, and entirely bypasses browser CORS limitations, ensuring cryptographic tokens are never exposed to the client.
2. **Zero-Trust Ingestion (FastAPI):** Traps malformed financial payloads via strict Pydantic V2 validation, releasing invalid client connections in <5ms.
3. **Redis Firewall & Polling Engine:** Handles long-running LLM inferences by offloading state machine execution to background tasks, returning an asynchronous `job_id` for client React polling (CQRS pattern) to prevent UI thread freezing.
4. **Dual-Engine Storage (PostgreSQL):** Explicitly separates volatile time-series data from static logic via SQLAlchemy and asyncpg.
5. **Recursive Intelligence (LangGraph):** A cyclic state machine that autonomously coordinates API tool calling, handles missing data gracefully, and executes mathematical reasoning.
6. **Defensive AI (The Gatekeeper):** A decoupled validation node that intercepts LLM hallucinations, enforcing a Ternary State Schema (`BUY`, `SELL`, or `INVALID`) before downstream UI hydration occurs.

## ⚙️ Enterprise Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **UI** | Next.js 15, React, Tailwind v4 | Server-side proxy, UI hydration, Asynchronous Polling |
| **Compute Gateway** | Python 3.11+, FastAPI, Pydantic | Schema validation, Async routing, Background tasks |
| **AI Architecture** | LangChain, LangGraph, OpenAI | Multi-agent chain-of-thought reasoning |
| **Message Broker** | Redis 7 | In-memory job queue and rate-limiting firewall |
| **Persistence** | PostgreSQL 15 | Persistent storage for historical financial data |
| **Infrastructure**| Vercel & Render | Multi-cloud serverless and containerized deployment |

## 🚀 Key Engineering Milestones

### 1. Multi-Cloud Edge Deployment 
The platform is globally deployed. The Next.js frontend is hosted on Vercel's global CDN, routing traffic securely to a Dockerized FastAPI compute cluster hosted on a Render Virtual Private Cloud (VPC), utilizing a shared-network Valkey cache for zero-egress latency.

### 2. Zero-Trust Gateway & Token-Bucket Rate Limiting 
The API gateway enforces a distributed Token-Bucket rate limiter (5 requests/min ceiling) in Redis to prevent API token draining and worker pool exhaustion. Request validation exceptions are captured by a centralized handler that returns standardized DataFirewallViolation responses without leaking internal stack traces.

### 3. Asynchronous CQRS & Gatekeeper Chaos Hardening
The LangGraph state machine is strictly hardened against prompt injection attacks. 
* **Command/Query Decoupling:** Ingestion endpoints instantly acknowledge jobs (202 Accepted) and pre-warm Redis state keys to eliminate status-check race conditions").
* **Chaos Hardening:** When subjected to adversarial prompt injection attacks, the decoupled Gatekeeper Node intercepts the payload, enforces the fallback schema, and issues a deterministic SIGNAL: INVALID in 1.49 seconds.

### 4. Persistent Real-Time Telemetry (WebSockets)
Replaced short-polling intervals with a persistent WebSocket pipeline backed by a custom ConnectionManager. The streaming interface includes:
* **Heartbeat Monitoring:** Automated 30-second ping/pong cycles to drop dead TCP connections.
* **Client Circuit Breakers:** Graceful reconnection and error-handling mechanisms that prevent UI lockups during network volatility.

### 5. Multi-Asset Batch Orchestration & Concurrency Fan-Out
To scale beyond single-ticker ingestion, the pipeline supports institutional asset baskets:
* **Zero-Trust Array Boundary:** FastAPI validates incoming payloads using a strict Pydantic BatchAnalysisRequest schema, capping single batch submissions at 50 tickers.
* **Throttled Concurrency Fan-Out:** Background chunking workers orchestrate parallel LangGraph executions under an asyncio.Semaphore(5) boundary, maximizing processing throughput while avoiding external LLM rate-limit bans.
* * **Distributed Queue Mapping:** Allocates independent UUID keys in Redis for each asset in the array, enabling concurrent telemetry streaming across the client UI.
* **Client Cooldown State Machine:** Integrated the dispatch controls with a client-side 60-second cooldown timer to prevent redundant invocations and avoid hitting backend firewalls.

## 💻 Local Infrastructure Ignition

The environment is strictly containerized to prevent state corruption. All database credentials and API keys are securely isolated via `.env` injection.

```bash
# 1. Clone the repository
git clone https://github.com/venkatesh5650/async-fintech-gateway.git
cd data-firewall

# 2. Boot the backend compute cluster & caches
cd backend
docker-compose up --build -d

# 3. Start the Next.js edge proxy
cd ../frontend
npm install
npm run dev
