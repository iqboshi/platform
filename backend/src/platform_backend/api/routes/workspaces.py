from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import WorkspaceSummary
from platform_backend.services.platform_store import list_workspaces

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[WorkspaceSummary],
    dependencies=[Depends(require_permission("workspace.view"))],
)
def list_workspaces_route(db: DatabaseDep) -> list[WorkspaceSummary]:
    return list_workspaces(db)
