from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from platform_backend.api.deps import get_current_user, require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import UserProfile, WorkflowRunSummary
from platform_backend.schemas.workflow import WorkflowRunAccepted, WorkflowRunRequest
from platform_backend.services.auth import get_user_by_id
from platform_backend.services.platform_store import create_workflow_run, list_workflow_runs

router = APIRouter()
CurrentUserDep = Annotated[UserProfile, Depends(get_current_user)]
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[WorkflowRunSummary],
    dependencies=[Depends(require_permission("workflow.view"))],
)
def list_workflow_runs_route(db: DatabaseDep) -> list[WorkflowRunSummary]:
    return list_workflow_runs(db)


@router.post(
    "",
    response_model=WorkflowRunAccepted,
    dependencies=[Depends(require_permission("workflow.run"))],
)
def create_workflow_run_route(
    request: WorkflowRunRequest,
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> WorkflowRunAccepted:
    user = get_user_by_id(db, current_user.id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found.")
    try:
        return create_workflow_run(db, request, user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
