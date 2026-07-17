# Asynchronous FinTech Data Engine & Storage Firewall

An enterprise-grade, zero-trust pipeline built to ingest volatile high-frequency market data, validate financial payloads, and asynchronously persist time-series metrics into PostgreSQL without thread starvation.

## 🏗 Architectural Blueprint

Most financial APIs crash under heavy load because synchronous database writes and slow outbound network requests block the main execution thread. This engine completely decouples ingestion from storage:

1. **Zero-Trust Perimeter:** Traps malformed financial payloads at the edge via strict Pydantic V2 validation, immediately rejecting bad data.
2. **Instant Client Release:** Returns `202 Accepted` status codes in <5ms, instantly freeing the client connection.
3. **The Asynchronous Storage Bridge:** Background event loops take the validated payload and execute non-blocking database writes via `asyncpg`. 
4. **Relational Time-Series Separation:** The PostgreSQL database explicitly segregates highly volatile time-series data (daily pricing/volume) from static corporate fundamentals to optimize query latency.

## ⚙️ Enterprise Tech Stack
* **Orchestration:** Docker Compose (Ephemeral, isolated networks)
* **Runtime:** Alpine Linux
* **Package Manager:** `uv` (Astral) - Hyper-fast deterministic builds
* **Ingestion Layer:** FastAPI / Uvicorn / Asyncio
* **Storage Layer:** PostgreSQL + `asyncpg` (Fully non-blocking database driver)

## 🚀 Local Infrastructure Ignition

The environment is strictly containerized to prevent state corruption. Ensure Docker Desktop is running.

```bash
# 1. Clone the repository
git clone https://github.com/venkatesh5650/async-fintech-gateway
cd data-firewall

# 2. Boot the API and PostgreSQL Storage Engine containers securely
docker compose up -d

# 3. Fire the concurrency stress test
# (Simulates 50 concurrent stock webhooks writing asynchronously to the database)
docker compose run --rm api uv run python db_stress_test.py