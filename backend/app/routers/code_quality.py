import logging
from fastapi import APIRouter, Depends, Request

from app.core.code_quality import code_quality_auditor
from app.core.telemetry import generate_trace_id
from app.database.schemas import CodeQualityReport
from app.routers.intelligence import verify_m2m_or_user

logger = logging.getLogger("code_quality_router")

router = APIRouter(prefix="/v1/system/code-quality", tags=["Code Quality & Static Analysis"])

_last_report: CodeQualityReport | None = None


@router.get("", response_model=CodeQualityReport)
@router.get("/", response_model=CodeQualityReport)
async def get_code_quality_report(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    global _last_report
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    if _last_report is None:
        _last_report = await code_quality_auditor.run_audit(trace_id=trace_id)
    return _last_report


@router.post("/scan", response_model=CodeQualityReport)
async def run_code_quality_scan(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    global _last_report
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    _last_report = await code_quality_auditor.run_audit(trace_id=trace_id)
    return _last_report
