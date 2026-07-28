# Alpha Sentinel: Autonomous FinTech Intelligence Engine

An enterprise-grade, event-driven trading intelligence engine built with FastAPI, LangGraph, Redis, and PostgreSQL. 

This repository demonstrates a production-grade approach to automated quantitative research. Instead of relying on vulnerable, single-prompt LLM scripts ("chatbots"), this engine utilizes a deterministic **Multi-Agent State Machine** behind an **Asynchronous CQRS API Gateway** to ingest high-frequency data, evaluate financial schemas, and generate strict trading signals while defending against prompt injections and volumetric DDoS attacks.

## 🏗 Architectural Blueprint

Most financial AI applications crash in production because they lack stateful memory, defensive routing, and network safeguards. This engine is built on a 5-pillar zero-trust architecture:

1. **Zero-Trust Ingestion (FastAPI):** Traps malformed financial payloads at the edge via strict Pydantic V2 validation, releasing client connections in <5ms.
2. **Redis Firewall & Polling Engine:** Implements a sliding-window rate limiter to instantly block malicious volumetric traffic. Handles long-running LLM inferences by offloading state machine execution to background tasks, returning an asynchronous `job_id` for client polling (CQRS pattern).
3. **Dual-Engine Storage (PostgreSQL):** Explicitly separates volatile time-series data from static logic. Uses `SQLAlchemy` for relational ORM management and non-blocking `asyncpg` for high-velocity raw SQL queries.
4. **Recursive Intelligence (LangGraph):** A cyclic state machine that autonomously coordinates API tool calling, handles missing data gracefully, and executes mathematical reasoning.
5. **Defensive AI (The Gatekeeper):** A decoupled validation node that intercepts LLM hallucinations. It enforces a **Ternary State Schema** (`BUY`, `SELL`, or `INVALID`), forcing tool pivots and rejecting malicious inputs before downstream algorithmic trading bots can parse bad JSON.

## ⚙️ Enterprise Tech Stack
* **Orchestration:** Docker Compose (Ephemeral, isolated bridge networking)
* **Backend:** Python 3.11+, FastAPI, Uvicorn
* **Cache & Firewall:** Redis 7 (Alpine), `redis.asyncio`
* **Package Manager:** `uv` (Astral) - Hyper-fast deterministic builds
* **Database:** PostgreSQL 15, SQLAlchemy 2.0, `asyncpg`
* **AI Architecture:** LangChain, LangGraph

## 🚀 Key Engineering Milestones

### 1. Asynchronous CQRS Gateway & Redis Firewall (Week 4)
To prevent the event loop from blocking during 5+ second LLM inferences, the system employs **Command Query Responsibility Segregation (CQRS)**.
* **The Command:** Clients POST a target ticker. The FastAPI gateway intercepts it, logs a pending job, offloads the LangGraph execution to a background worker, and instantly returns a `202 Accepted` with a UUID `job_id`.
* **The Query:** Clients GET the `/job/{job_id}` endpoint to poll for the completed `IntelligenceResponse`.
* **The Firewall:** Every request passes through a Redis pipeline that atomically updates a 60-second sliding window. Breaches of the RPM (Requests Per Minute) threshold instantly trigger an `HTTP 429` fail-safe.

### 2. The Chaos Engineering Injection (Week 3)
The LangGraph state machine is strictly hardened against real-world degradation and Prompt Injection attacks. 
**The Chaos Test:** Injecting a malicious user prompt (*"Write a poem about Wall Street"*) while severing the primary database connection.
**The Engine's Response:** 1. The AI attempted to hallucinate a poem.
2. The decoupled **Gatekeeper Node** intercepted the schema violation.
3. The Gatekeeper dynamically updated the LLM's memory, reprimanding it.
4. The Agent autonomously pivoted to a secondary `asyncpg` fallback strategy.
5. The system formally rejected the prompt injection, gracefully returning a machine-readable `SIGNAL: INVALID` in **1.49 seconds**.

## 💻 Local Infrastructure Ignition

The environment is strictly containerized to prevent state corruption and enforce the 12-Factor App methodology. All database credentials and API keys are securely isolated via `.env` injection.

```bash
# 1. Clone the repository
git clone [https://github.com/your-username/alpha-sentinel.git](https://github.com/your-username/alpha-sentinel.git)
cd alpha-sentinel

# 2. Boot the API, PostgreSQL, and Redis containers securely
docker compose up -d --build

# 3. Verify Container Health and Network Isolation
docker ps

📡 API Interaction Protocol
1. Dispatch an Analysis Job

```bash
curl -X POST http://localhost:8000/v1/analyze \
     -H "Content-Type: application/json" \
     -d '{"ticker": "NVDA"}'
```

Expected Response (202 Accepted):

```
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "message": "Task offloaded to background worker."
}
```
2. Poll for the Intelligence Report

```
curl -X GET http://localhost:8000/v1/jobs/550e8400-e29b-41d4-a716-446655440000 
```
Expected Response (200 OK):
```
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "ticker": "NVDA",
    "signal": "SIGNAL: BUY",
    "analysis_report": "Current price is trading above the 50-day SMA. Institutional sentiment remains bullish.",
    "execution_time_ms": 1240.5
  }
}
```