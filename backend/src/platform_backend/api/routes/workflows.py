from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import ApiMessage, UserProfile
from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowSummary,
    WorkflowTemplateDefinition,
    WorkflowValidationResult,
    WorkflowVersionSummary,
)
from platform_backend.services.platform_store import (
    delete_workflow_version,
    get_current_workflow_version,
    get_workflow_version_download_payload,
    import_workflow_version,
    list_workflow_catalog,
    list_workflow_templates,
    list_workflow_versions,
    list_workflows,
    save_current_workflow_version,
)
from platform_backend.workflows.validation import validate_workflow_graph

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
WorkflowViewUserDep = Annotated[UserProfile, Depends(require_permission("workflow.view"))]
WorkflowManageUserDep = Annotated[UserProfile, Depends(require_permission("workflow.manage"))]


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
)
def get_current_workflow_version_route(
    db: DatabaseDep,
    current_user: WorkflowViewUserDep,
) -> WorkflowVersionSummary:
    try:
        return get_current_workflow_version(db, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put(
    "/versions/current",
    response_model=WorkflowVersionSummary,
)
def save_workflow_version_route(
    request: WorkflowGraph,
    db: DatabaseDep,
    current_user: WorkflowManageUserDep,
) -> WorkflowVersionSummary:
    try:
        return save_current_workflow_version(db, request, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/versions",
    response_model=list[WorkflowVersionSummary],
)
def list_workflow_versions_route(
    db: DatabaseDep,
    current_user: WorkflowViewUserDep,
    scope: str = "mine",
) -> list[WorkflowVersionSummary]:
    try:
        return list_workflow_versions(db, current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/versions/import",
    response_model=WorkflowVersionSummary,
)
def import_workflow_version_route(
    request: WorkflowGraph,
    db: DatabaseDep,
    current_user: WorkflowManageUserDep,
) -> WorkflowVersionSummary:
    try:
        return import_workflow_version(db, request, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/versions/{workflow_version_id}/download",
)
def download_workflow_version_route(
    workflow_version_id: str,
    db: DatabaseDep,
    current_user: WorkflowViewUserDep,
) -> Response:
    payload = get_workflow_version_download_payload(db, workflow_version_id, current_user)
    if payload is None:
        raise HTTPException(status_code=404, detail="Workflow version not found.")

    body, file_name = payload
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.delete(
    "/versions/{workflow_version_id}",
    response_model=ApiMessage,
)
def delete_workflow_version_route(
    workflow_version_id: str,
    db: DatabaseDep,
    current_user: WorkflowManageUserDep,
) -> ApiMessage:
    try:
        delete_workflow_version(db, workflow_version_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return ApiMessage(message="Workflow version deleted.")


@router.post(
    "/validate",
    response_model=WorkflowValidationResult,
    dependencies=[Depends(require_permission("workflow.manage"))],
)
def validate_workflow(request: WorkflowGraph) -> WorkflowValidationResult:
    return validate_workflow_graph(request)
