from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from platform_backend.domain_enums import (
    ApprovalStatus,
    DatasetKind,
    DatasetStatus,
    JobStatus,
    LocaleCode,
    RoleKey,
    WorkflowRunStatus,
)


class ApiMessage(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserProfile"


class UserProfile(BaseModel):
    id: str
    email: str
    display_name: str
    role: RoleKey
    approval_status: ApprovalStatus
    preferred_locale: LocaleCode
    permissions: list[str] = Field(default_factory=list)


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
    description: str = ""
    kind: DatasetKind
    status: DatasetStatus
    is_private: bool = False
    bands: int | None = None
    projection: str | None = None
    footprint: str | None = None
    visibility: str = "private"
    owner_user_id: str | None = None
    owner_display_name: str | None = None
    latest_version_id: str | None = None
    latest_version_number: int | None = None
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
    is_private: bool = False
    visibility: str = "private"
    owner_user_id: str | None = None
    owner_display_name: str | None = None
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


class DatasetUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    original_file_name: str | None = None
    content_type: str | None = None
    row_count: int | None = None
    columns: list[str] | None = None
    sample_record: dict[str, Any] | None = None
    visibility: str | None = None


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
    model_name: str | None = None
    algorithm_key: str | None = None
    version: str
    framework: str
    task_type: str
    weights_path: str
    feature_names: list[str] = Field(default_factory=list)
    default_parameters: dict[str, Any] = Field(default_factory=dict)
    artifact_format: str | None = None
    source_type: Literal["uploaded", "trained", "custom_api", "seeded"] = "uploaded"
    execution_mode: Literal["in_process", "external_api"] = "in_process"
    visibility: str = "private"
    owner_user_id: str | None = None
    owner_display_name: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
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
    result_dataset_version_id: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ModelUploadRequest(BaseModel):
    workspace_id: str
    model_name: str
    version: str
    algorithm_key: str
    task_type: str
    framework: str = "json"
    feature_names: list[str] = Field(default_factory=list)
    default_parameters: dict[str, Any] = Field(default_factory=dict)


class CustomApiModelCreateRequest(BaseModel):
    workspace_id: str
    model_name: str
    version: str = "1.0.0"
    task_type: str = "regression"
    description: str = ""
    endpoint_url: str
    timeout_seconds: int = 30
    auth_type: Literal["none", "bearer", "header"] = "none"
    auth_token: str | None = None
    auth_header_name: str | None = None
    response_mode: Literal["prediction_values", "table_rows"] = "prediction_values"
    default_prediction_column: str = "prediction"
    default_parameters: dict[str, Any] = Field(default_factory=dict)


TokenResponse.model_rebuild()
