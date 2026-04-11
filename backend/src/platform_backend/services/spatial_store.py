from __future__ import annotations

from copy import deepcopy
from math import isfinite
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.core.visibility import (
    can_access_by_visibility,
    can_manage_owned_asset,
    normalize_visibility,
)
from platform_backend.domain_enums import DatasetKind, RoleKey
from platform_backend.models.entities import (
    Dataset,
    DatasetVersion,
    SpatialOverlay,
    SpatialRoi,
    User,
    Workspace,
)
from platform_backend.schemas.platform import UserProfile
from platform_backend.schemas.spatial import (
    SpatialOverlayCreateRequest,
    SpatialOverlaySummary,
    SpatialOverlayUpdateRequest,
    SpatialRoiCreateRequest,
    SpatialRoiSummary,
    SpatialRoiUpdateRequest,
)
from platform_backend.schemas.workflow import WorkflowGraph


def _is_admin_user(current_user: UserProfile | User | None) -> bool:
    if current_user is None:
        return False
    if isinstance(current_user, UserProfile):
        return current_user.role == RoleKey.ADMIN
    return current_user.role_key == RoleKey.ADMIN


def _dataset_visibility(metadata: dict[str, object] | None) -> str:
    if not metadata:
        return "workspace"
    visibility = str(metadata.get("visibility", "workspace")).strip().lower()
    if visibility in {"private", "public", "workspace"}:
        return visibility
    return "workspace"


def _dataset_owner_user_id(metadata: dict[str, object] | None) -> str | None:
    if not metadata:
        return None
    owner_user_id = str(metadata.get("owner_user_id", "")).strip()
    return owner_user_id or None


def _can_access_dataset_version(
    row: DatasetVersion,
    current_user: UserProfile | User | None,
) -> bool:
    if _dataset_visibility(row.metadata_json) != "private":
        return True
    if current_user is None:
        return False
    if _is_admin_user(current_user):
        return True
    return _dataset_owner_user_id(row.metadata_json) == current_user.id


def _normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    seen: set[str] = set()
    normalized: list[str] = []
    for item in tags:
        value = str(item).strip()
        if not value:
            continue
        if value not in seen:
            seen.add(value)
            normalized.append(value)
    return normalized


def _normalize_style(style: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(style, dict):
        return {}
    return dict(style)


def _validate_geojson_polygon(
    geometry_type: str,
    geometry: dict[str, Any],
) -> tuple[dict[str, Any], list[float]]:
    if not isinstance(geometry, dict):
        raise ValueError("geometry must be a GeoJSON object.")
    if str(geometry.get("type", "")).strip() != "Polygon":
        raise ValueError("Only GeoJSON Polygon geometries are supported.")

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("Polygon coordinates are required.")

    first_ring = coordinates[0]
    if not isinstance(first_ring, list) or len(first_ring) < 4:
        raise ValueError("Polygon must contain at least four coordinate pairs.")

    points: list[list[float]] = []
    for point in first_ring:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise ValueError("Each coordinate must contain longitude and latitude.")
        lon = float(point[0])
        lat = float(point[1])
        if not (isfinite(lon) and isfinite(lat)):
            raise ValueError("Geometry coordinates must be finite numbers.")
        if not -180 <= lon <= 180:
            raise ValueError("Longitude must be within [-180, 180].")
        if not -90 <= lat <= 90:
            raise ValueError("Latitude must be within [-90, 90].")
        points.append([lon, lat])

    longitudes = [point[0] for point in points]
    latitudes = [point[1] for point in points]
    min_x = min(longitudes)
    max_x = max(longitudes)
    min_y = min(latitudes)
    max_y = max(latitudes)
    if min_x >= max_x or min_y >= max_y:
        raise ValueError("Geometry extent is invalid.")
    if geometry_type not in {"rectangle", "polygon"}:
        raise ValueError("geometry_type must be rectangle or polygon.")

    normalized_geometry = {
        "type": "Polygon",
        "coordinates": [[point[:2] for point in points]],
    }
    return normalized_geometry, [min_x, min_y, max_x, max_y]


def _owner_name_map(db: Session, owner_ids: set[str]) -> dict[str, str]:
    if not owner_ids:
        return {}
    rows = db.scalars(select(User).where(User.id.in_(owner_ids))).all()
    return {row.id: row.display_name for row in rows}


def _roi_summary(row: SpatialRoi, owner_display_name: str | None) -> SpatialRoiSummary:
    return SpatialRoiSummary(
        id=row.id,
        workspace_id=row.workspace_id,
        owner_user_id=row.owner_user_id,
        owner_display_name=owner_display_name,
        name=row.name,
        description=row.description,
        geometry_type=row.geometry_type,
        geometry=dict(row.geometry_json or {}),
        bbox=list(row.bbox or []),
        style=dict(row.style_json or {}),
        tags=list(row.tags_json or []),
        visibility=row.visibility,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _overlay_source_info(
    dataset: Dataset,
    version: DatasetVersion,
) -> tuple[str, str, str, list[float] | None, str | None]:
    metadata = version.metadata_json if isinstance(version.metadata_json, dict) else {}
    original_file_name = str(
        metadata.get("original_file_name", version.original_file_name)
    ).strip()
    content_type = str(metadata.get("content_type", version.content_type)).strip()
    suffix = Path(original_file_name).suffix.lower()

    if dataset.kind == DatasetKind.RASTER and (
        suffix in {".tif", ".tiff"}
        or "tiff" in content_type.lower()
        or "geotiff" in content_type.lower()
    ):
        return "raster", original_file_name, content_type, version.bbox, version.preview_url

    if dataset.kind == DatasetKind.VECTOR and (
        suffix in {".geojson", ".json"}
        or "geo+json" in content_type.lower()
        or content_type.lower().endswith("/json")
    ):
        return "vector", original_file_name, content_type, version.bbox, version.preview_url

    raise ValueError(
        "Only GeoTIFF raster and GeoJSON vector dataset versions "
        "can be used as overlays."
    )


def _overlay_summary(
    row: SpatialOverlay,
    dataset: Dataset,
    version: DatasetVersion,
    owner_display_name: str | None,
) -> SpatialOverlaySummary:
    overlay_type, original_file_name, content_type, bbox, preview_url = _overlay_source_info(
        dataset,
        version,
    )
    return SpatialOverlaySummary(
        id=row.id,
        workspace_id=row.workspace_id,
        owner_user_id=row.owner_user_id,
        owner_display_name=owner_display_name,
        dataset_version_id=row.dataset_version_id,
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        dataset_kind=dataset.kind,
        dataset_version_number=version.version,
        original_file_name=original_file_name,
        content_type=content_type,
        bbox=bbox,
        preview_url=preview_url,
        name=row.name,
        description=row.description,
        overlay_type=overlay_type,
        opacity=float(row.opacity),
        style=dict(row.style_json or {}),
        visibility=row.visibility,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _can_access_spatial_owner(owner_user_id: str, current_user: UserProfile | User | None) -> bool:
    return can_manage_owned_asset(
        owner_user_id,
        current_user_id=current_user.id if current_user is not None else None,
        is_admin=_is_admin_user(current_user),
    )


def _can_access_spatial_visibility(
    visibility: str,
    owner_user_id: str,
    current_user: UserProfile | User | None,
) -> bool:
    return can_access_by_visibility(
        visibility,
        owner_user_id,
        current_user_id=current_user.id if current_user is not None else None,
        is_admin=_is_admin_user(current_user),
    )


def _get_workspace(db: Session, workspace_id: str) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise LookupError("Workspace not found.")
    return workspace


def list_spatial_rois(
    db: Session,
    *,
    current_user: UserProfile | User,
    scope: str = "mine",
) -> list[SpatialRoiSummary]:
    rows = db.scalars(select(SpatialRoi).order_by(SpatialRoi.updated_at.desc())).all()
    if scope == "all":
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can list all spatial ROIs.")
    elif scope == "mine":
        rows = [row for row in rows if row.owner_user_id == current_user.id]
    else:
        rows = [
            row
            for row in rows
            if _can_access_spatial_visibility(row.visibility, row.owner_user_id, current_user)
        ]
    owner_names = _owner_name_map(db, {row.owner_user_id for row in rows})
    return [_roi_summary(row, owner_names.get(row.owner_user_id)) for row in rows]


def create_spatial_roi(
    db: Session,
    *,
    request: SpatialRoiCreateRequest,
    current_user: UserProfile | User,
) -> SpatialRoiSummary:
    _get_workspace(db, request.workspace_id)
    geometry, bbox = _validate_geojson_polygon(request.geometry_type, request.geometry)
    row = SpatialRoi(
        workspace_id=request.workspace_id,
        owner_user_id=current_user.id,
        name=request.name.strip(),
        description=request.description.strip(),
        geometry_type=request.geometry_type,
        geometry_json=geometry,
        bbox=bbox,
        style_json=_normalize_style(request.style),
        tags_json=_normalize_tags(request.tags),
        visibility="private",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    owner_display_name = (
        current_user.display_name
        if isinstance(current_user, UserProfile)
        else current_user.display_name
    )
    return _roi_summary(row, owner_display_name)


def update_spatial_roi(
    db: Session,
    roi_id: str,
    *,
    request: SpatialRoiUpdateRequest,
    current_user: UserProfile | User,
) -> SpatialRoiSummary:
    row = db.get(SpatialRoi, roi_id)
    if row is None:
        raise LookupError("Spatial ROI not found.")
    if not _can_access_spatial_owner(row.owner_user_id, current_user):
        raise PermissionError("Only the owner or an administrator can edit this spatial ROI.")

    if request.name is not None:
        row.name = request.name.strip()
    if request.description is not None:
        row.description = request.description.strip()

    next_geometry_type = request.geometry_type or row.geometry_type
    next_geometry = request.geometry or dict(row.geometry_json or {})
    if request.geometry_type is not None or request.geometry is not None:
        geometry, bbox = _validate_geojson_polygon(next_geometry_type, next_geometry)
        row.geometry_type = next_geometry_type
        row.geometry_json = geometry
        row.bbox = bbox

    if request.style is not None:
        row.style_json = _normalize_style(request.style)
    if request.tags is not None:
        row.tags_json = _normalize_tags(request.tags)
    if request.visibility is not None:
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can change spatial ROI visibility.")
        row.visibility = normalize_visibility(request.visibility, default=row.visibility)

    db.commit()
    db.refresh(row)
    owner_name = db.get(User, row.owner_user_id)
    return _roi_summary(row, owner_name.display_name if owner_name else None)


def delete_spatial_roi(
    db: Session,
    roi_id: str,
    *,
    current_user: UserProfile | User,
) -> None:
    row = db.get(SpatialRoi, roi_id)
    if row is None:
        raise LookupError("Spatial ROI not found.")
    if not _can_access_spatial_owner(row.owner_user_id, current_user):
        raise PermissionError("Only the owner or an administrator can delete this spatial ROI.")
    db.delete(row)
    db.commit()


def resolve_spatial_roi_bbox(
    db: Session,
    roi_id: str,
    *,
    current_user: UserProfile | User,
) -> list[float]:
    row = db.get(SpatialRoi, roi_id)
    if row is None:
        raise LookupError("Spatial ROI not found.")
    if not _can_access_spatial_visibility(row.visibility, row.owner_user_id, current_user):
        raise PermissionError("You do not have access to this spatial ROI.")
    return list(row.bbox or [])


def _resolve_overlay_dataset_version(
    db: Session,
    dataset_version_id: str,
    *,
    current_user: UserProfile | User,
) -> tuple[Dataset, DatasetVersion]:
    version = db.get(DatasetVersion, dataset_version_id)
    if version is None:
        raise LookupError("Dataset version not found.")
    if not _can_access_dataset_version(version, current_user):
        raise PermissionError("You do not have access to this dataset version.")
    dataset = db.get(Dataset, version.dataset_id)
    if dataset is None:
        raise LookupError("Dataset not found.")
    return dataset, version


def list_spatial_overlays(
    db: Session,
    *,
    current_user: UserProfile | User,
    scope: str = "mine",
) -> list[SpatialOverlaySummary]:
    rows = db.scalars(select(SpatialOverlay).order_by(SpatialOverlay.updated_at.desc())).all()
    if scope == "all":
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can list all spatial overlays.")
    elif scope == "mine":
        rows = [row for row in rows if row.owner_user_id == current_user.id]
    else:
        rows = [
            row
            for row in rows
            if _can_access_spatial_visibility(row.visibility, row.owner_user_id, current_user)
        ]

    owner_names = _owner_name_map(db, {row.owner_user_id for row in rows})
    summaries: list[SpatialOverlaySummary] = []
    for row in rows:
        try:
            dataset, version = _resolve_overlay_dataset_version(
                db,
                row.dataset_version_id,
                current_user=current_user,
            )
            summaries.append(
                _overlay_summary(row, dataset, version, owner_names.get(row.owner_user_id))
            )
        except (LookupError, PermissionError, ValueError):
            continue
    return summaries


def create_spatial_overlay(
    db: Session,
    *,
    request: SpatialOverlayCreateRequest,
    current_user: UserProfile | User,
) -> SpatialOverlaySummary:
    _get_workspace(db, request.workspace_id)
    dataset, version = _resolve_overlay_dataset_version(
        db,
        request.dataset_version_id,
        current_user=current_user,
    )
    overlay_type, _, _, _, _ = _overlay_source_info(dataset, version)
    row = SpatialOverlay(
        workspace_id=request.workspace_id,
        owner_user_id=current_user.id,
        dataset_version_id=request.dataset_version_id,
        name=request.name.strip(),
        description=request.description.strip(),
        overlay_type=overlay_type,
        opacity=float(request.opacity),
        style_json=_normalize_style(request.style),
        visibility="private",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    owner_display_name = (
        current_user.display_name
        if isinstance(current_user, UserProfile)
        else current_user.display_name
    )
    return _overlay_summary(row, dataset, version, owner_display_name)


def _validate_public_overlay_source(version: DatasetVersion) -> None:
    if _dataset_visibility(version.metadata_json) != "public":
        raise ValueError(
            "Spatial overlays can be published only when the source dataset version is public."
        )


def update_spatial_overlay(
    db: Session,
    overlay_id: str,
    *,
    request: SpatialOverlayUpdateRequest,
    current_user: UserProfile | User,
) -> SpatialOverlaySummary:
    row = db.get(SpatialOverlay, overlay_id)
    if row is None:
        raise LookupError("Spatial overlay not found.")
    if not _can_access_spatial_owner(row.owner_user_id, current_user):
        raise PermissionError("Only the owner or an administrator can edit this overlay.")
    dataset, version = _resolve_overlay_dataset_version(
        db,
        row.dataset_version_id,
        current_user=current_user,
    )
    overlay_type, _, _, _, _ = _overlay_source_info(dataset, version)
    row.overlay_type = overlay_type

    if request.name is not None:
        row.name = request.name.strip()
    if request.description is not None:
        row.description = request.description.strip()
    if request.opacity is not None:
        row.opacity = float(request.opacity)
    if request.style is not None:
        row.style_json = _normalize_style(request.style)
    if request.visibility is not None:
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can change overlay visibility.")
        next_visibility = normalize_visibility(request.visibility, default=row.visibility)
        if next_visibility == "public":
            _validate_public_overlay_source(version)
        row.visibility = next_visibility

    db.commit()
    db.refresh(row)
    owner_name = db.get(User, row.owner_user_id)
    return _overlay_summary(row, dataset, version, owner_name.display_name if owner_name else None)


def delete_spatial_overlay(
    db: Session,
    overlay_id: str,
    *,
    current_user: UserProfile | User,
) -> None:
    row = db.get(SpatialOverlay, overlay_id)
    if row is None:
        raise LookupError("Spatial overlay not found.")
    if not _can_access_spatial_owner(row.owner_user_id, current_user):
        raise PermissionError("Only the owner or an administrator can delete this overlay.")
    db.delete(row)
    db.commit()


def resolve_saved_rois_in_workflow_graph(
    db: Session,
    graph: WorkflowGraph,
    *,
    current_user: UserProfile | User,
) -> WorkflowGraph:
    graph_json = deepcopy(graph.model_dump(mode="json"))
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list):
        return graph

    for node in nodes:
        if (
            not isinstance(node, dict)
            or str(node.get("type", "")) != "source.sentinel2_gee_download"
        ):
            continue
        params = node.get("params", {})
        if not isinstance(params, dict):
            continue
        roi_mode = str(params.get("roiMode", "manual_bbox") or "manual_bbox").strip()
        if roi_mode != "saved_roi":
            continue
        roi_id = str(params.get("roiId", "")).strip()
        if not roi_id:
            raise ValueError("roiId is required when roiMode is saved_roi.")
        bbox = resolve_spatial_roi_bbox(db, roi_id, current_user=current_user)
        params["bbox"] = bbox
        node["params"] = params

    return WorkflowGraph.model_validate(graph_json)
