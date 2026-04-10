from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from platform_backend.domain_enums import (
    ApprovalStatus,
    DatasetKind,
    DatasetStatus,
    FeedbackTicketCategory,
    FeedbackTicketPriority,
    FeedbackTicketStatus,
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
    avatar_url: str = ""
    job_title: str = ""
    organization: str = ""
    bio: str = ""
    last_login_at: datetime | None = None
    permissions: list[str] = Field(default_factory=list)


class EmailSettingsSummary(BaseModel):
    email_enabled: bool = False
    smtp_host: str = "smtp.qq.com"
    smtp_port: int = 465
    smtp_use_ssl: bool = True
    smtp_username: str = ""
    smtp_password_configured: bool = False
    smtp_from_email: str = ""
    smtp_from_name: str = "Platform RS Studio"
    smtp_timeout_seconds: int = 20
    email_code_expire_minutes: int = 10
    email_code_resend_seconds: int = 60
    image_captcha_expire_minutes: int = 5


class EmailSettingsUpdateRequest(BaseModel):
    email_enabled: bool = False
    smtp_host: str = Field(default="smtp.qq.com", min_length=1, max_length=255)
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_use_ssl: bool = True
    smtp_username: str = Field(default="", max_length=255)
    smtp_password: str | None = Field(default=None, max_length=2000)
    clear_smtp_password: bool = False
    smtp_from_email: str = Field(default="", max_length=255)
    smtp_from_name: str = Field(default="Platform RS Studio", max_length=255)
    smtp_timeout_seconds: int = Field(default=20, ge=1, le=120)
    email_code_expire_minutes: int = Field(default=10, ge=1, le=120)
    email_code_resend_seconds: int = Field(default=60, ge=0, le=3600)
    image_captcha_expire_minutes: int = Field(default=5, ge=1, le=60)


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


class ProductAssetSummary(BaseModel):
    id: str
    workspace_id: str
    owner_user_id: str
    owner_display_name: str | None = None
    name: str
    description: str = ""
    category: str = ""
    tags: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    specifications: dict[str, str] = Field(default_factory=dict)
    visibility: Literal["private", "public"] = "private"
    asset_path: str
    original_file_name: str
    content_type: str
    size_bytes: int = 0
    created_at: datetime
    updated_at: datetime


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
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class GeeCredentialSummary(BaseModel):
    id: str
    workspace_id: str
    owner_user_id: str
    owner_display_name: str | None = None
    name: str
    provider: str = "gee"
    description: str = ""
    project_id: str | None = None
    service_account_email: str | None = None
    is_platform_default: bool = False
    created_at: datetime


class GeeCredentialCreateRequest(BaseModel):
    workspace_id: str
    name: str
    description: str = ""
    project_id: str | None = None
    service_account_json: str


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


class DashboardFeatureItem(BaseModel):
    id: str
    title_zh: str
    title_en: str
    summary_zh: str
    summary_en: str
    button_label_zh: str
    button_label_en: str
    href: str
    icon_key: str = "overview"
    enabled: bool = True


class DashboardAnnouncementItem(BaseModel):
    id: str
    title_zh: str
    title_en: str
    summary_zh: str
    summary_en: str
    content_zh: str
    content_en: str
    tag_zh: str = ""
    tag_en: str = ""
    published_at: str
    pinned: bool = False
    published: bool = True


class DashboardConfig(BaseModel):
    feature_sections: list[DashboardFeatureItem] = Field(default_factory=list)
    announcements: list[DashboardAnnouncementItem] = Field(default_factory=list)


class DashboardConfigUpdateRequest(DashboardConfig):
    pass


class FeedbackTicketSummary(BaseModel):
    id: str
    workspace_id: str
    created_by: str
    created_by_display_name: str | None = None
    title: str
    category: FeedbackTicketCategory
    priority: FeedbackTicketPriority
    status: FeedbackTicketStatus
    content: str
    contact: str = ""
    admin_reply: str = ""
    created_at: datetime
    updated_at: datetime


class FeedbackTicketCreateRequest(BaseModel):
    workspace_id: str
    title: str
    category: FeedbackTicketCategory
    priority: FeedbackTicketPriority = FeedbackTicketPriority.MEDIUM
    content: str
    contact: str = ""


class FeedbackTicketUpdateRequest(BaseModel):
    title: str | None = None
    category: FeedbackTicketCategory | None = None
    priority: FeedbackTicketPriority | None = None
    status: FeedbackTicketStatus | None = None
    content: str | None = None
    contact: str | None = None
    admin_reply: str | None = None


class FeedbackTicketSummaryCounts(BaseModel):
    my_open_count: int = 0
    my_active_count: int = 0
    admin_open_count: int = 0
    admin_in_progress_count: int = 0


TokenResponse.model_rebuild()
