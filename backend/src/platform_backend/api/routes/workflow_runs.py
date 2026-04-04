from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import UserProfile, WorkflowRunSummary
from platform_backend.schemas.workflow import WorkflowRunAccepted, WorkflowRunRequest
from platform_backend.services.auth import get_user_by_id
from platform_backend.services.platform_store import create_workflow_run, list_workflow_runs

router = APIRouter()
WorkflowRunUserDep = Annotated[UserProfile, Depends(require_permission("workflow.run"))]
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[WorkflowRunSummary],
)
def list_workflow_runs_route(
    db: DatabaseDep,
    current_user: Annotated[UserProfile, Depends(require_permission("workflow.view"))],
    scope: str = "visible",
) -> list[WorkflowRunSummary]:
    try:
        return list_workflow_runs(db, current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "",
    response_model=WorkflowRunAccepted,
)
def create_workflow_run_route(
    request: WorkflowRunRequest,
    current_user: WorkflowRunUserDep,
    db: DatabaseDep,
) -> WorkflowRunAccepted:
    user = get_user_by_id(db, current_user.id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found.")
    try:
        return create_workflow_run(db, request, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
