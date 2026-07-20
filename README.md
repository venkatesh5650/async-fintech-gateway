# Alpha Sentinel: Autonomous FinTech Intelligence Engine

An enterprise-grade, event-driven trading intelligence engine built with FastAPI, LangGraph, and PostgreSQL. 

This repository demonstrates a production-grade approach to automated quantitative research. Instead of relying on vulnerable, single-prompt LLM scripts ("chatbots"), this engine utilizes a deterministic **Multi-Agent State Machine** to ingest high-frequency data, evaluate financial schemas, and generate strict trading signals while defending against prompt injections.

## 🏗 Architectural Blueprint

Most financial AI applications crash in production because they lack stateful memory and defensive routing. This engine is built on a 4-pillar zero-trust architecture:

1. **Zero-Trust Ingestion (FastAPI):** Traps malformed financial payloads at the edge via strict Pydantic V2 validation, releasing client connections in <5ms.
2. **Dual-Engine Storage (PostgreSQL):** Explicitly separates volatile time-series data from static logic. Uses `SQLAlchemy` for relational ORM management and non-blocking `asyncpg` for high-velocity raw SQL queries.
3. **Recursive Intelligence (LangGraph):** A cyclic state machine that autonomously coordinates API tool calling, handles missing data gracefully, and executes mathematical reasoning.
4. **Defensive AI (The Gatekeeper):** A decoupled validation node that intercepts LLM hallucinations. It enforces a **Ternary State Schema** (`BUY`, `SELL`, or `INVALID`), forcing tool pivots and rejecting malicious inputs before downstream algorithmic trading bots can parse bad JSON.

## ⚙️ Enterprise Tech Stack
* **Orchestration:** Docker Compose (Ephemeral, isolated networks)
* **Backend:** Python 3.11+, FastAPI, Uvicorn
* **Package Manager:** `uv` (Astral) - Hyper-fast deterministic builds
* **Database:** PostgreSQL, SQLAlchemy, `asyncpg`
* **AI Architecture:** LangChain, LangGraph

## 🚀 The Chaos Engineering Milestone (Week 3)

The system is strictly hardened against real-world degradation and Prompt Injection attacks. 

**The Chaos Test:** Injecting a malicious user prompt (*"Write a poem about Wall Street"*) while severing the primary database connection.
**The Engine's Response:** 1. The AI attempted to hallucinate a poem.
2. The decoupled **Gatekeeper Node** intercepted the schema violation.
3. The Gatekeeper dynamically updated the LLM's memory, reprimanding it.
4. The Agent autonomously pivoted to a secondary `asyncpg` fallback strategy.
5. The system formally rejected the prompt injection, gracefully safely returning a machine-readable `SIGNAL: INVALID` in **1.49 seconds**.

## 💻 Local Infrastructure Ignition

The environment is strictly containerized to prevent state corruption and enforce the 12-Factor App methodology. All database credentials and API keys are securely isolated via `.env` injection.

```bash
# 1. Clone the repository
git clone [https://github.com/venkatesh5650/async-fintech-gateway](https://github.com/venkatesh5650/async-fintech-gateway)
cd data-firewall

# 2. Boot the API and PostgreSQL Storage Engine containers securely
docker compose up -d

# 3. Trigger the LangGraph Intelligence Engine Chaos Test
docker compose run --rm api uv run python graph.py