import logging
from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse

from app.core.architecture import SystemArchitectureRegistry
from app.core.telemetry import generate_trace_id
from app.database.schemas import SystemArchitectureTopology
from app.routers.intelligence import verify_m2m_or_user

logger = logging.getLogger("architecture_router")

router = APIRouter(prefix="/v1/system/architecture", tags=["System Architecture Topology"])


@router.get("", response_model=SystemArchitectureTopology)
@router.get("/", response_model=SystemArchitectureTopology)
async def get_system_architecture_topology(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    topology = SystemArchitectureRegistry.get_topology(trace_id=trace_id)
    return topology


@router.get("/mermaid", response_class=PlainTextResponse)
async def get_mermaid_architecture_diagram(
    request: Request,
    auth_data: dict = Depends(verify_m2m_or_user),
):
    trace_id = getattr(request.state, "trace_id", None) or generate_trace_id()
    topology = SystemArchitectureRegistry.get_topology(trace_id=trace_id)
    return PlainTextResponse(topology.mermaid_diagram, media_type="text/plain")
