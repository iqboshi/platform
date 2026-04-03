from fastapi import APIRouter

from platform_backend.schemas.platform import WorkspaceSummary
from platform_backend.services.demo_data import workspaces

router = APIRouter()


@router.get("", response_model=list[WorkspaceSummary])
def list_workspaces() -> list[WorkspaceSummary]:
    return workspaces()
