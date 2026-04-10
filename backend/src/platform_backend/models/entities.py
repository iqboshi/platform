from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from platform_backend.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin
from platform_backend.domain_enums import (
    ApprovalStatus,
    DatasetKind,
    DatasetStatus,
    EmailVerificationScene,
    FeedbackTicketCategory,
    FeedbackTicketPriority,
    FeedbackTicketStatus,
    JobStatus,
    LocaleCode,
    RoleKey,
    RoleUpgradeRequestStatus,
    WorkflowRunStatus,
)


class Role(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    key: Mapped[RoleKey] = mapped_column(Enum(RoleKey), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_key: Mapped[RoleKey] = mapped_column(Enum(RoleKey), nullable=False)
    approval_status: Mapped[ApprovalStatus] = mapped_column(Enum(ApprovalStatus), nullable=False)
    preferred_locale: Mapped[LocaleCode] = mapped_column(Enum(LocaleCode), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserProfileDetail(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_profile_details"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    avatar_url: Mapped[str] = mapped_column(Text, default="", nullable=False)
    job_title: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    organization: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    bio: Mapped[str] = mapped_column(Text, default="", nullable=False)


class ImageCaptchaChallenge(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "image_captcha_challenges"

    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailVerificationChallenge(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "email_verification_challenges"

    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    scene: Mapped[EmailVerificationScene] = mapped_column(
        Enum(EmailVerificationScene),
        nullable=False,
        index=True,
    )
    requested_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RoleUpgradeRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "role_upgrade_requests"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    current_role: Mapped[RoleKey] = mapped_column(Enum(RoleKey), nullable=False)
    requested_role: Mapped[RoleKey] = mapped_column(Enum(RoleKey), nullable=False)
    status: Mapped[RoleUpgradeRequestStatus] = mapped_column(
        Enum(RoleUpgradeRequestStatus),
        nullable=False,
        default=RoleUpgradeRequestStatus.PENDING,
    )
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    review_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)


class WorkspaceMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspace_memberships"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_key: Mapped[RoleKey] = mapped_column(Enum(RoleKey), nullable=False)


class Dataset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "datasets"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[DatasetKind] = mapped_column(Enum(DatasetKind), nullable=False)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), nullable=False)
    projection: Mapped[str | None] = mapped_column(String(120), nullable=True)
    footprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)


class DatasetVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "dataset_versions"

    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), nullable=False)
    asset_path: Mapped[str] = mapped_column(String(255), nullable=False)
    preview_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bbox: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class SplitJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "split_jobs"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    dataset_version_id: Mapped[str] = mapped_column(
        ForeignKey("dataset_versions.id"),
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), nullable=False)
    params_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    output_dataset_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class Workflow(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflows"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)


class WorkflowVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflow_versions"

    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    graph_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class WorkflowRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workflow_runs"

    workflow_version_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_versions.id"),
        nullable=False,
    )
    input_dataset_version_id: Mapped[str] = mapped_column(
        ForeignKey("dataset_versions.id"),
        nullable=False,
    )
    model_version_id: Mapped[str] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    status: Mapped[WorkflowRunStatus] = mapped_column(Enum(WorkflowRunStatus), nullable=False)
    submitted_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    result_dataset_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GeeCredential(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "gee_credentials"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="gee")
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    service_account_json: Mapped[str] = mapped_column(Text, nullable=False)


class SpatialRoi(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "spatial_rois"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    geometry_type: Mapped[str] = mapped_column(String(40), nullable=False)
    geometry_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    bbox: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)
    style_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    tags_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="private")


class SpatialOverlay(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "spatial_overlays"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    dataset_version_id: Mapped[str] = mapped_column(
        ForeignKey("dataset_versions.id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    overlay_type: Mapped[str] = mapped_column(String(40), nullable=False)
    opacity: Mapped[float] = mapped_column(nullable=False, default=0.85)
    style_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="private")


class ProductAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "product_assets"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    category: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    tags_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    highlights_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    specifications_json: Mapped[dict[str, str]] = mapped_column(JSON, default=dict, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    asset_path: Mapped[str] = mapped_column(String(255), nullable=False)
    original_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PlatformSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    value_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class FeedbackTicket(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "feedback_tickets"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[FeedbackTicketCategory] = mapped_column(
        Enum(FeedbackTicketCategory),
        nullable=False,
    )
    priority: Mapped[FeedbackTicketPriority] = mapped_column(
        Enum(FeedbackTicketPriority),
        nullable=False,
        default=FeedbackTicketPriority.MEDIUM,
    )
    status: Mapped[FeedbackTicketStatus] = mapped_column(
        Enum(FeedbackTicketStatus),
        nullable=False,
        default=FeedbackTicketStatus.OPEN,
    )
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    contact: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    admin_reply: Mapped[str] = mapped_column(Text, default="", nullable=False)


class Model(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "models"

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    task_type: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)


class ModelVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "model_versions"

    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    framework: Mapped[str] = mapped_column(String(80), nullable=False)
    task_type: Mapped[str] = mapped_column(String(120), nullable=False)
    weights_path: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class JobLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "job_logs"

    job_type: Mapped[str] = mapped_column(String(80), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(36), nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
