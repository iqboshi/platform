from fastapi import APIRouter

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowSummary,
    WorkflowValidationResult,
    WorkflowVersionSummary,
)
from platform_backend.services.demo_data import workflow_catalog, workflow_summary, workflow_version
from platform_backend.workflows.validation import validate_workflow_graph

router = APIRouter()


@router.get("", response_model=list[WorkflowSummary])
def list_workflows() -> list[WorkflowSummary]:
    return [workflow_summary()]


@router.get("/catalog", response_model=list[WorkflowCatalogItem])
def list_catalog() -> list[WorkflowCatalogItem]:
    return workflow_catalog()


@router.get("/versions/current", response_model=WorkflowVersionSummary)
def get_current_workflow_version() -> WorkflowVersionSummary:
    return workflow_version()


@router.post("/validate", response_model=WorkflowValidationResult)
def validate_workflow(request: WorkflowGraph) -> WorkflowValidationResult:
    return validate_workflow_graph(request)
