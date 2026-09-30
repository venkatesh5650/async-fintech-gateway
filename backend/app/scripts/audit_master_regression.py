import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.regression_orchestrator import MasterRegressionOrchestrator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_master_regression")


async def run_master_regression():
    logger.info("================================================================================")
    logger.info("🏆 [DAY 86 MASTER REGRESSION SUITE] 33-POINT FULL SYSTEM VERIFICATION")
    logger.info("================================================================================")

    orchestrator = MasterRegressionOrchestrator()
    report = await orchestrator.run_full_regression()

    for idx, suite in enumerate(report.suites, 1):
        icon = "✅" if suite.status == "PASSED" else "❌"
        logger.info(f"\n{icon} [{idx}/{report.total_suites}] {suite.suite_name}")
        logger.info(
            f"   ├─ Status: {suite.status} ({suite.assertions_passed}/{suite.total_assertions} assertions in {suite.duration_ms}ms)"
        )
        for a in suite.assertions:
            a_icon = "  ✓" if a.passed else "  ✗"
            logger.info(f"   │ {a_icon} [{a.assertion_number}] {a.title}: {a.details or ''}")

    logger.info("\n================================================================================")
    logger.info("🏁 MASTER REGRESSION AUDIT SUMMARY")
    logger.info("================================================================================")
    logger.info(f"   ├─ Overall Status:     {report.status}")
    logger.info(f"   ├─ Run Identifier:     {report.run_id}")
    logger.info(f"   ├─ W3C Trace ID:       {report.trace_id}")
    logger.info(f"   ├─ Suites Passed:      {report.suites_passed}/{report.total_suites}")
    logger.info(
        f"   ├─ Assertions Passed:  {report.assertions_passed}/{report.total_assertions} ({report.pass_rate_pct}%)"
    )
    logger.info(f"   └─ Total Duration:     {report.total_duration_ms}ms")
    logger.info("================================================================================")

    if report.status != "PASSED" or report.assertions_passed < report.total_assertions:
        logger.error(
            f"REGRESSION AUDIT FAILED: {report.total_assertions - report.assertions_passed} assertions failed."
        )
        sys.exit(1)

    logger.info("🎉 100% REGRESSION CERTIFIED: ALL 33 ASSERTIONS PASSED WITH ZERO REGRESSIONS.")
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_master_regression())
