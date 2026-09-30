import logging
from fastapi import APIRouter, Depends, Request, status, HTTPException

from app.core.regression_orchestrator import MasterRegressionOrchestrator
from app.core.telemetry import generate_trace_id
from app.database.schemas import MasterRegressionReport
from app.routers.intelligence import verify_m2m_or_user

logger = logging.getLogger("regression_router")

router = APIRouter(prefix="/v1/audit/regression", tags=["System Regression Audit"])
orchestrator = MasterRegressionOrchestrator()


@router.get("/latest", response_model=MasterRegressionReport)
async def get_latest_regression_report(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    try:
        report = await orchestrator.get_latest_report()
        report.trace_id = trace_id
        return report
    except Exception as e:
        logger.error(f"Failed to retrieve latest regression audit report: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Regression audit telemetry retrieval failed: {str(e)}",
        )


@router.post("/run", response_model=MasterRegressionReport)
async def trigger_full_regression(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    try:
        report = await orchestrator.run_full_regression(trace_id=trace_id)
        return report
    except Exception as e:
        logger.error(f"Full regression audit execution failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Regression audit execution failed: {str(e)}",
        )
