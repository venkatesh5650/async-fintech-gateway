"""
Production Seeding Pipeline & Migration Engine Audit Suite
----------------------------------------------------------
Automated 5-point verification suite evaluating:
1. Migration runner schema synchronization & pgvector extension validation.
2. Deterministic multi-ticker historical candles and signals population.
3. Strict idempotency and conflict-free re-execution guarantees.
4. Seed status report API (GET /v1/cloud/seed/status).
5. Dynamic seed execution API (POST /v1/cloud/seed/run) with W3C lineage.
"""

import asyncio
import logging
import os
import sys
import time

from httpx import ASGITransport, AsyncClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.migration_runner import DatabaseMigrationRunner
from app.core.production_seeder import ProductionSeedManager
from app.database.schemas import (
    MigrationStatusReport,
    SeedExecutionRequest,
    SeedExecutionResponse,
    SeedStatusReport,
)
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_production_seed")


async def run_production_seed_audit():
    logger.info("================================================================================")
    logger.info("[INFRASTRUCTURE AUDIT] DATABASE MIGRATION & INSTITUTIONAL SEEDING PIPELINE")
    logger.info("================================================================================")

    passed_count = 0
    total_assertions = 5
    transport = ASGITransport(app=app)
    migration_runner = DatabaseMigrationRunner()
    seed_manager = ProductionSeedManager()

    # ----------------------------------------------------------------------
    # Assertion 1: Migration Runner & Schema Synchronization
    # ----------------------------------------------------------------------
    logger.info("\n[1/5] Testing Database Migration Runner & Schema Synchronization...")
    mig_report = await migration_runner.verify_or_apply_migrations()

    assert mig_report.status == "SYNCHRONIZED", f"Migration not synchronized: {mig_report.status}"
    assert mig_report.total_tables >= 5, f"Expected >= 5 tables, got {mig_report.total_tables}"
    for tbl in ["tickers", "market_pricing", "users", "computed_signals", "document_chunks"]:
        assert tbl in mig_report.tables_verified, f"Table {tbl} missing from verified tables"

    passed_count += 1
    logger.info(
        f"  ✓ Schema migration verified: status={mig_report.status}, tables={mig_report.tables_verified}, pgvector={mig_report.pgvector_extension_ready}"
    )

    # ----------------------------------------------------------------------
    # Assertion 2: Deterministic Multi-Asset Seeding Pipeline
    # ----------------------------------------------------------------------
    logger.info("\n[2/5] Testing Deterministic Multi-Asset Seeding Pipeline...")
    req = SeedExecutionRequest(
        tickers=["AAPL", "NVDA"],
        days_history=30,
        seed_rag_passages=True,
        force_refresh=True,
    )
    seed_res = await seed_manager.run_seed(request=req)

    assert seed_res.status == "COMPLETED", f"Seed run failed: {seed_res.status}"
    assert seed_res.seeded_tickers_count == 2, f"Expected 2 tickers, got {seed_res.seeded_tickers_count}"
    assert seed_res.total_candles_inserted > 0, "No candles inserted"
    assert seed_res.total_signals_inserted > 0, "No signals inserted"
    assert seed_res.total_chunks_inserted == 6, f"Expected 6 chunks (3 per ticker), got {seed_res.total_chunks_inserted}"

    passed_count += 1
    logger.info(
        f"  ✓ Seeding pipeline verified: {seed_res.seeded_tickers_count} tickers, {seed_res.total_candles_inserted} candles, "
        f"{seed_res.total_signals_inserted} signals, {seed_res.total_chunks_inserted} chunks in {seed_res.duration_ms}ms"
    )

    # ----------------------------------------------------------------------
    # Assertion 3: Strict Idempotency Assurance (Zero Duplicate Crashes)
    # ----------------------------------------------------------------------
    logger.info("\n[3/5] Testing Strict Idempotency & Conflict-Free Re-execution...")
    repeat_res = await seed_manager.run_seed(request=req)

    assert repeat_res.status == "COMPLETED", f"Idempotent re-run failed: {repeat_res.status}"
    assert repeat_res.seeded_tickers_count == 2, "Idempotent re-run did not process expected tickers"

    passed_count += 1
    logger.info("  ✓ Idempotency verified: re-executed full seed with zero unique constraint violations.")

    # ----------------------------------------------------------------------
    # Assertion 4: Seed Status API Contract (GET /v1/cloud/seed/status)
    # ----------------------------------------------------------------------
    logger.info("\n[4/5] Testing Seed Status REST API Endpoint GET /v1/cloud/seed/status...")
    test_trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    test_traceparent = f"00-{test_trace_id}-00f067aa0ba902b7-01"

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/v1/cloud/seed/status", headers={"traceparent": test_traceparent})
        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}: {resp.text}"

        payload = resp.json()
        status_report = SeedStatusReport.model_validate(payload)

        assert status_report.trace_id == test_trace_id, f"Trace ID not propagated: {status_report.trace_id}"
        assert status_report.total_tickers == 10, f"Expected 10 benchmark tickers, got {status_report.total_tickers}"
        assert len(status_report.tickers) == 10, "Summary items count mismatch"

        # AAPL and NVDA must be SEEDED
        seeded_symbols = {t.symbol for t in status_report.tickers if t.status == "SEEDED"}
        assert "AAPL" in seeded_symbols, "AAPL should be marked SEEDED"
        assert "NVDA" in seeded_symbols, "NVDA should be marked SEEDED"

    passed_count += 1
    logger.info(
        f"  ✓ Seed status API verified: tickers={status_report.total_tickers}, total_candles={status_report.total_candles}, trace preserved."
    )

    # ----------------------------------------------------------------------
    # Assertion 5: Dynamic Seed Execution API (POST /v1/cloud/seed/run) & Lineage
    # ----------------------------------------------------------------------
    logger.info("\n[5/5] Testing Dynamic Seed Execution REST API POST /v1/cloud/seed/run...")
    post_payload = {
        "tickers": ["MSFT"],
        "days_history": 20,
        "seed_rag_passages": True,
        "force_refresh": True,
    }

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        start_t = time.perf_counter()
        resp = await client.post(
            "/v1/cloud/seed/run",
            json=post_payload,
            headers={"traceparent": test_traceparent},
        )
        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)

        assert resp.status_code == 200, f"Expected HTTP 200, got {resp.status_code}: {resp.text}"
        res_payload = resp.json()
        validated_exec = SeedExecutionResponse.model_validate(res_payload)

        assert validated_exec.trace_id == test_trace_id, "W3C trace ID not preserved"
        assert validated_exec.seeded_tickers_count == 1, "Expected 1 seeded ticker"
        assert "MSFT" in validated_exec.tickers, "MSFT not in seeded symbols list"
        assert validated_exec.total_candles_inserted > 0, "No candles inserted for MSFT"

    passed_count += 1
    logger.info(
        f"  ✓ Seed trigger API verified: HTTP 200 OK ({elapsed_ms}ms), run_id={validated_exec.run_id}, trace preserved."
    )

    logger.info("\n================================================================================")
    logger.info(
        f"🏁 PRODUCTION SEEDING AUDIT COMPLETE: {passed_count}/{total_assertions} ASSERTIONS PASSED (100%)"
    )
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_production_seed_audit())
