from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import ApiMessage, UserProfile
from platform_backend.schemas.spatial import (
    SpatialOverlayCreateRequest,
    SpatialOverlaySummary,
    SpatialOverlayUpdateRequest,
    SpatialRoiCreateRequest,
    SpatialRoiSummary,
    SpatialRoiUpdateRequest,
)
from platform_backend.services.spatial_store import (
    create_spatial_overlay,
    create_spatial_roi,
    delete_spatial_overlay,
    delete_spatial_roi,
    list_spatial_overlays,
    list_spatial_rois,
    update_spatial_overlay,
    update_spatial_roi,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
SpatialViewUserDep = Annotated[UserProfile, Depends(require_permission("dataset.view"))]
SpatialManageUserDep = Annotated[UserProfile, Depends(require_permission("dataset.manage"))]


@router.get(
    "/rois",
    response_model=list[SpatialRoiSummary],
)
def list_spatial_rois_route(
    db: DatabaseDep,
    current_user: SpatialViewUserDep,
    scope: str = "mine",
) -> list[SpatialRoiSummary]:
    try:
        return list_spatial_rois(db, current_user=current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/rois",
    response_model=SpatialRoiSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_spatial_roi_route(
    request: SpatialRoiCreateRequest,
    db: DatabaseDep,
    current_user: SpatialManageUserDep,
) -> SpatialRoiSummary:
    try:
        return create_spatial_roi(db, request=request, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/rois/{roi_id}",
    response_model=SpatialRoiSummary,
)
def update_spatial_roi_route(
    roi_id: str,
    request: SpatialRoiUpdateRequest,
    db: DatabaseDep,
    current_user: SpatialManageUserDep,
) -> SpatialRoiSummary:
    try:
        return update_spatial_roi(db, roi_id, request=request, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/rois/{roi_id}",
    response_model=ApiMessage,
)
def delete_spatial_roi_route(
    roi_id: str,
    db: DatabaseDep,
    current_user: SpatialManageUserDep,
) -> ApiMessage:
    try:
        delete_spatial_roi(db, roi_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return ApiMessage(message="Spatial ROI deleted.")


@router.get(
    "/overlays",
    response_model=list[SpatialOverlaySummary],
)
def list_spatial_overlays_route(
    db: DatabaseDep,
    current_user: SpatialViewUserDep,
    scope: str = "mine",
) -> list[SpatialOverlaySummary]:
    try:
        return list_spatial_overlays(db, current_user=current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/overlays",
    response_model=SpatialOverlaySummary,
    status_code=status.HTTP_201_CREATED,
)
def create_spatial_overlay_route(
    request: SpatialOverlayCreateRequest,
    db: DatabaseDep,
    current_user: SpatialManageUserDep,
) -> SpatialOverlaySummary:
    try:
        return create_spatial_overlay(db, request=request, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/overlays/{overlay_id}",
    response_model=SpatialOverlaySummary,
)
def update_spatial_overlay_route(
    overlay_id: str,
    request: SpatialOverlayUpdateRequest,
    db: DatabaseDep,
    current_user: SpatialManageUserDep,
) -> SpatialOverlaySummary:
    try:
        return update_spatial_overlay(db, overlay_id, request=request, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/overlays/{overlay_id}",
    response_model=ApiMessage,
)
def delete_spatial_overlay_route(
    overlay_id: str,
    db: DatabaseDep,
    current_user: SpatialManageUserDep,
) -> ApiMessage:
    try:
        delete_spatial_overlay(db, overlay_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return ApiMessage(message="Spatial overlay deleted.")
