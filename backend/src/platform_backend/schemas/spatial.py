from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from platform_backend.domain_enums import DatasetKind

SpatialGeometryType = Literal["rectangle", "polygon"]
SpatialOverlayType = Literal["raster", "vector"]


class SpatialRoiSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    owner_user_id: str
    owner_display_name: str | None = None
    name: str
    description: str = ""
    geometry_type: SpatialGeometryType
    geometry: dict[str, Any] = Field(default_factory=dict)
    bbox: list[float] = Field(default_factory=list)
    style: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    visibility: str = "private"
    created_at: datetime
    updated_at: datetime


class SpatialRoiCreateRequest(BaseModel):
    workspace_id: str
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    geometry_type: SpatialGeometryType
    geometry: dict[str, Any]
    style: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class SpatialRoiUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    geometry_type: SpatialGeometryType | None = None
    geometry: dict[str, Any] | None = None
    style: dict[str, Any] | None = None
    tags: list[str] | None = None
    visibility: str | None = None


class SpatialOverlaySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    owner_user_id: str
    owner_display_name: str | None = None
    dataset_version_id: str
    dataset_id: str
    dataset_name: str
    dataset_kind: DatasetKind
    dataset_version_number: int
    original_file_name: str = ""
    content_type: str = "application/octet-stream"
    bbox: list[float] | None = None
    preview_url: str | None = None
    name: str
    description: str = ""
    overlay_type: SpatialOverlayType
    opacity: float = 0.85
    style: dict[str, Any] = Field(default_factory=dict)
    visibility: str = "private"
    created_at: datetime
    updated_at: datetime


class SpatialOverlayCreateRequest(BaseModel):
    workspace_id: str
    dataset_version_id: str
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    opacity: float = Field(default=0.85, ge=0, le=1)
    style: dict[str, Any] = Field(default_factory=dict)


class SpatialOverlayUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    opacity: float | None = Field(default=None, ge=0, le=1)
    style: dict[str, Any] | None = None
    visibility: str | None = None
