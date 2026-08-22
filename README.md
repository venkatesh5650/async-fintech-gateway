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

### 2. Asynchronous CQRS Gateway 
To prevent the React UI event loop from blocking during 5+ second LLM inferences, the system employs Command Query Responsibility Segregation (CQRS).
* **The Command:** Clients `POST` a ticker. The proxy offloads the LangGraph execution to a background worker and instantly returns a `202 Accepted` with a UUID `job_id`.
* **The Query:** The React client initiates a non-blocking `setInterval` hook, polling the `GET /job/{job_id}` endpoint to gracefully hydrate the UI upon AI completion.

### 3. The Chaos Engineering Injection 
The LangGraph state machine is strictly hardened against prompt injection attacks. 
* **The Chaos Test:** Injecting a malicious user prompt ("Write a poem about Wall Street").
* **The Response:** The decoupled Gatekeeper Node intercepted the schema violation, reprimanded the LLM in memory, forced a fallback strategy, and gracefully returned a machine-readable `SIGNAL: INVALID` to the UI in 1.49 seconds.

### 4. The Real-Time Command Center & Dual-Auth Edge 
The presentation layer is not a static webpage; it is a live FinTech terminal that enforces strict Command Query Responsibility Segregation (CQRS) at the UI level.
* **Zero-Trust Dual Gatekeeper:** The FastAPI perimeter dynamically authenticates both autonomous Machine-to-Machine (M2M) orchestrators and human Next.js JWT sessions through a unified ASGI dependency.
* **Reactive Telemetry UI:** A non-blocking `setInterval` React state machine polls the Redis background queue, gracefully hydrating the DOM with institutional-grade conditional styling and millisecond execution latency telemetry.
* **Secure Client-Side Mutations:** A decoupled "Terminal Command Center" allows operators to manually bypass the cache and force heavy LangGraph re-evaluations without exposing API keys to the browser, triggering layout shifts, or forcing hard browser refreshes.

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
