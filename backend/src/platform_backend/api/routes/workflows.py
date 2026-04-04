from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowSummary,
    WorkflowTemplateDefinition,
    WorkflowValidationResult,
    WorkflowVersionSummary,
)
from platform_backend.services.platform_store import (
    get_current_workflow_version,
    list_workflow_catalog,
    list_workflow_templates,
    list_workflows,
    save_current_workflow_version,
)
from platform_backend.workflows.validation import validate_workflow_graph

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[WorkflowSummary],
    dependencies=[Depends(require_permission("workflow.view"))],
)
def list_workflows_route(db: DatabaseDep) -> list[WorkflowSummary]:
    return list_workflows(db)


@router.get(
    "/catalog",
    response_model=list[WorkflowCatalogItem],
    dependencies=[Depends(require_permission("workflow.view"))],
)
def list_catalog() -> list[WorkflowCatalogItem]:
    return list_workflow_catalog()


@router.get(
    "/templates",
    response_model=list[WorkflowTemplateDefinition],
    dependencies=[Depends(require_permission("workflow.view"))],
)
def list_templates() -> list[WorkflowTemplateDefinition]:
    return list_workflow_templates()


@router.get(
    "/versions/current",
    response_model=WorkflowVersionSummary,
    dependencies=[Depends(require_permission("workflow.view"))],
)
def get_current_workflow_version_route(db: DatabaseDep) -> WorkflowVersionSummary:
    try:
        return get_current_workflow_version(db)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put(
    "/versions/current",
    response_model=WorkflowVersionSummary,
    dependencies=[Depends(require_permission("workflow.manage"))],
)
def save_workflow_version_route(request: WorkflowGraph, db: DatabaseDep) -> WorkflowVersionSummary:
    try:
        return save_current_workflow_version(db, request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/validate",
    response_model=WorkflowValidationResult,
    dependencies=[Depends(require_permission("workflow.manage"))],
)
def validate_workflow(request: WorkflowGraph) -> WorkflowValidationResult:
    return validate_workflow_graph(request)
