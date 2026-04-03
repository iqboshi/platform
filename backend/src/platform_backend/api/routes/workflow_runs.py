from uuid import uuid4

from fastapi import APIRouter

from platform_backend.domain_enums import WorkflowRunStatus
from platform_backend.schemas.platform import WorkflowRunSummary
from platform_backend.schemas.workflow import WorkflowRunAccepted, WorkflowRunRequest
from platform_backend.services.demo_data import current_user, workflow_runs

router = APIRouter()


@router.get("", response_model=list[WorkflowRunSummary])
def list_workflow_runs() -> list[WorkflowRunSummary]:
    return workflow_runs()


@router.post("", response_model=WorkflowRunAccepted)
def create_workflow_run(request: WorkflowRunRequest) -> WorkflowRunAccepted:
    return WorkflowRunAccepted(
        id=f"run-{uuid4()}",
        workflow_version_id=request.workflow_version_id,
        status=WorkflowRunStatus.QUEUED,
        submitted_by=current_user().display_name,
    )
