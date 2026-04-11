from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.application.asset_flow import (
    get_asset_flow_overview,
    list_asset_input_candidates,
)
from platform_backend.db.session import get_db
from platform_backend.schemas.asset_flow import AssetFlowOverview, AssetInputCandidate
from platform_backend.schemas.platform import UserProfile

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
WorkflowViewUserDep = Annotated[UserProfile, Depends(require_permission("workflow.view"))]
DatasetViewUserDep = Annotated[UserProfile, Depends(require_permission("dataset.view"))]


@router.get(
    "/overview",
    response_model=AssetFlowOverview,
)
def get_asset_flow_overview_route(
    db: DatabaseDep,
    current_user: WorkflowViewUserDep,
    scope: str = "mine",
) -> AssetFlowOverview:
    try:
        return get_asset_flow_overview(db, current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/input-candidates",
    response_model=list[AssetInputCandidate],
)
def list_asset_input_candidates_route(
    db: DatabaseDep,
    current_user: DatasetViewUserDep,
    consumer: str,
    scope: str = "visible",
) -> list[AssetInputCandidate]:
    try:
        return list_asset_input_candidates(
            db,
            current_user,
            consumer=consumer,
            scope=scope,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
