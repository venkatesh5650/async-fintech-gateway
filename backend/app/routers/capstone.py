import logging
from fastapi import APIRouter, Depends, Request

from app.core.capstone_report import capstone_registry
from app.core.telemetry import generate_trace_id
from app.database.schemas import Phase2CapstoneReport
from app.routers.intelligence import verify_m2m_or_user

logger = logging.getLogger("capstone_router")

router = APIRouter(prefix="/v1/system/capstone-report", tags=["System Telemetry & Health Probes"])


@router.get("", response_model=Phase2CapstoneReport)
@router.get("/", response_model=Phase2CapstoneReport)
async def get_phase2_capstone_report(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    report = capstone_registry.get_capstone_report(trace_id=trace_id)
    return report
