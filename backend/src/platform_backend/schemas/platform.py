from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from platform_backend.domain_enums import (
    DatasetKind,
    DatasetStatus,
    JobStatus,
    RoleKey,
    WorkflowRunStatus,
)


class ApiMessage(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfile(BaseModel):
    id: str
    email: str
    display_name: str
    role: RoleKey


class WorkspaceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    description: str
    member_count: int


class DatasetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    kind: DatasetKind
    status: DatasetStatus
    bands: int | None = None
    projection: str | None = None
    footprint: str | None = None
    updated_at: datetime


class DatasetVersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    version: int
    status: DatasetStatus
    asset_path: str
    preview_url: str | None = None
    bbox: list[float] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DatasetUploadRequest(BaseModel):
    workspace_id: str
    dataset_name: str
    kind: DatasetKind
    file_name: str
    content_type: str
    size_bytes: int


class UploadSessionResponse(BaseModel):
    object_key: str
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str] = Field(default_factory=dict)


class DatasetUploadConfirmRequest(BaseModel):
    object_key: str
    workspace_id: str
    dataset_name: str
    kind: DatasetKind


class SplitJobRequest(BaseModel):
    workspace_id: str
    dataset_version_id: str
    tile_size: int = 512
    overlap: int = 64
    split_strategy: str = "train-val-test"


class SplitJobSummary(BaseModel):
    id: str
    workspace_id: str
    dataset_version_id: str
    status: JobStatus
    tile_size: int
    overlap: int
    split_strategy: str
    created_at: datetime


class ModelSummary(BaseModel):
    id: str
    workspace_id: str
    name: str
    task_type: str
    description: str


class ModelVersionSummary(BaseModel):
    id: str
    model_id: str
    version: str
    framework: str
    task_type: str
    weights_path: str
    created_at: datetime


class JobSummary(BaseModel):
    id: str
    job_type: str
    reference_id: str
    status: JobStatus
    message: str
    created_at: datetime


class TilePreviewResponse(BaseModel):
    dataset_version_id: str
    tilejson_url: str
    bounds: list[float] | None = None
    minzoom: int = 8
    maxzoom: int = 18


class WorkflowRunSummary(BaseModel):
    id: str
    workflow_version_id: str
    status: WorkflowRunStatus
    submitted_by: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
