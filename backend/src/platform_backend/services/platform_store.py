from __future__ import annotations

import csv
import json
import mimetypes
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import BinaryIO
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

import platform_backend.workflows.gee_runtime as gee_runtime
from platform_backend.core.settings import get_settings
from platform_backend.core.visibility import (
    can_access_by_visibility,
    can_manage_owned_asset,
    normalize_visibility,
)
from platform_backend.domain_enums import (
    DatasetKind,
    DatasetStatus,
    JobStatus,
    RoleKey,
    WorkflowRunStatus,
)
from platform_backend.models.entities import (
    Dataset,
    DatasetVersion,
    GeeCredential,
    JobLog,
    Model,
    ModelVersion,
    PlatformSetting,
    SplitJob,
    User,
    Workflow,
    WorkflowRun,
    WorkflowVersion,
    Workspace,
    WorkspaceMembership,
)
from platform_backend.schemas.platform import (
    CustomApiModelCreateRequest,
    DatasetSummary,
    DatasetUploadConfirmRequest,
    DatasetVersionSummary,
    GeeCredentialCreateRequest,
    GeeCredentialSummary,
    JobSummary,
    ModelSummary,
    ModelVersionSummary,
    SplitJobRequest,
    SplitJobSummary,
    TilePreviewResponse,
    UploadSessionResponse,
    UserProfile,
    WorkflowRunSummary,
    WorkspaceSummary,
)
from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowNodeTestResponse,
    WorkflowRunAccepted,
    WorkflowRunRequest,
    WorkflowSummary,
    WorkflowTemplateDefinition,
    WorkflowVersionSummary,
)
from platform_backend.services.spatial_store import resolve_saved_rois_in_workflow_graph
from platform_backend.services.state_machine import ensure_workflow_run_transition
from platform_backend.workflows.catalog import BUILTIN_NODE_CATALOG, workflow_templates
from platform_backend.workflows.tabular_runtime import (
    create_tabular_model_metadata,
    execute_tabular_graph,
    is_supported_tabular_graph,
    summarize_csv_file,
    test_tabular_node,
)

PLATFORM_DEFAULT_GEE_CREDENTIAL_KEY = "integration.gee.default_credential"


def _storage_root() -> Path:
    root = Path(get_settings().storage_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip())
    return normalized.strip("-").lower() or "file"


def _is_admin_user(current_user: UserProfile | User | None) -> bool:
    if current_user is None:
        return False
    if isinstance(current_user, UserProfile):
        return current_user.role == RoleKey.ADMIN
    return current_user.role_key == RoleKey.ADMIN


def _dataset_visibility(metadata: dict[str, object] | None) -> str:
    if not metadata:
        return "workspace"
    try:
        return normalize_visibility(
            str(metadata.get("visibility", "workspace")),
            default="workspace",
            allow_workspace=True,
        )
    except ValueError:
        return "workspace"


def _dataset_owner_user_id(metadata: dict[str, object] | None) -> str | None:
    if not metadata:
        return None
    owner_user_id = str(metadata.get("owner_user_id", "")).strip()
    return owner_user_id or None


def _dataset_owner_display_name(metadata: dict[str, object] | None) -> str | None:
    if not metadata:
        return None
    owner_display_name = str(metadata.get("owner_display_name", "")).strip()
    return owner_display_name or None


def _model_visibility(metadata: dict[str, object] | None) -> str:
    if not metadata:
        return "workspace"
    try:
        return normalize_visibility(
            str(metadata.get("visibility", "private")),
            default="private",
            allow_workspace=True,
        )
    except ValueError:
        return "private"


def _model_owner_user_id(metadata: dict[str, object] | None) -> str | None:
    if not metadata:
        return None
    owner_user_id = str(metadata.get("owner_user_id", "")).strip()
    return owner_user_id or None


def _model_owner_display_name(metadata: dict[str, object] | None) -> str | None:
    if not metadata:
        return None
    owner_display_name = str(metadata.get("owner_display_name", "")).strip()
    return owner_display_name or None


def _is_private_model_metadata(metadata: dict[str, object] | None) -> bool:
    return _model_visibility(metadata) == "private"


def _can_access_model_version(
    row: ModelVersion,
    current_user: UserProfile | User | None,
) -> bool:
    return can_access_by_visibility(
        _model_visibility(row.metadata_json),
        _model_owner_user_id(row.metadata_json),
        current_user_id=current_user.id if current_user is not None else None,
        is_admin=_is_admin_user(current_user),
    )


def _sanitize_model_metadata(metadata: dict[str, object] | None) -> dict[str, object]:
    if not isinstance(metadata, dict):
        return {}

    sanitized = dict(metadata)
    api_config = sanitized.get("api_config")
    if isinstance(api_config, dict):
        sanitized["api_config"] = {
            key: value
            for key, value in api_config.items()
            if key not in {"auth_token"}
        }
    return sanitized


def _is_private_version_metadata(metadata: dict[str, object] | None) -> bool:
    return _dataset_visibility(metadata) == "private"


def _is_public_version_metadata(metadata: dict[str, object] | None) -> bool:
    return _dataset_visibility(metadata) == "public"


def _can_access_dataset_version(
    row: DatasetVersion, current_user: UserProfile | User | None
) -> bool:
    if not _is_private_version_metadata(row.metadata_json):
        return True
    if current_user is None:
        return False

    if _is_admin_user(current_user):
        return True
    return _dataset_owner_user_id(row.metadata_json) == current_user.id


def _latest_dataset_version(db: Session, dataset_id: str) -> DatasetVersion | None:
    return db.scalar(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset_id)
        .order_by(DatasetVersion.version.desc(), DatasetVersion.created_at.desc())
    )


def _dataset_is_result(metadata: dict[str, object] | None) -> bool:
    if not metadata:
        return False
    return any(key in metadata for key in {"workflow_run_id", "source_run_id"})


def _can_manage_dataset(
    metadata: dict[str, object] | None,
    current_user: UserProfile | User,
) -> bool:
    if _is_admin_user(current_user):
        return True
    return _dataset_owner_user_id(metadata) == current_user.id


def _workflow_metadata(graph_json: dict[str, object] | None) -> dict[str, object]:
    if not graph_json:
        return {}
    metadata = graph_json.get("metadata", {})
    return dict(metadata) if isinstance(metadata, dict) else {}


def _workflow_owner_user_id(row: WorkflowVersion) -> str | None:
    owner_user_id = str(_workflow_metadata(row.graph_json).get("owner_user_id", "")).strip()
    return owner_user_id or None


def _workflow_owner_display_name(row: WorkflowVersion) -> str | None:
    owner_display_name = str(
        _workflow_metadata(row.graph_json).get("owner_display_name", "")
    ).strip()
    return owner_display_name or None


def _workflow_visibility(row: WorkflowVersion) -> str:
    try:
        return normalize_visibility(
            str(_workflow_metadata(row.graph_json).get("visibility", "private")),
            default="private",
        )
    except ValueError:
        return "private"


def _unique_string_values(values: list[object]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _gee_service_account_email(service_account_json: str) -> str | None:
    try:
        payload = json.loads(service_account_json)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None
    service_account_email = str(payload.get("client_email", "")).strip()
    return service_account_email or None


def _gee_credential_summary(
    row: GeeCredential,
    owner_display_name: str | None,
    *,
    is_platform_default: bool = False,
) -> GeeCredentialSummary:
    return GeeCredentialSummary(
        id=row.id,
        workspace_id=row.workspace_id,
        owner_user_id=row.owner_user_id,
        owner_display_name=owner_display_name,
        name=row.name,
        provider=row.provider,
        description=row.description,
        project_id=row.project_id,
        service_account_email=_gee_service_account_email(row.service_account_json),
        is_platform_default=is_platform_default,
        created_at=row.created_at,
    )


def _can_access_gee_credential(
    row: GeeCredential,
    current_user: UserProfile | User | None,
) -> bool:
    if current_user is None:
        return False
    if _is_admin_user(current_user):
        return True
    return row.owner_user_id == current_user.id


def _platform_setting(db: Session, key: str) -> PlatformSetting | None:
    return db.scalar(select(PlatformSetting).where(PlatformSetting.key == key))


def _platform_default_gee_credential_id(db: Session) -> str | None:
    setting = _platform_setting(db, PLATFORM_DEFAULT_GEE_CREDENTIAL_KEY)
    if setting is None or not isinstance(setting.value_json, dict):
        return None
    credential_id = str(setting.value_json.get("credential_id", "")).strip()
    return credential_id or None


def _can_access_workflow_version(
    row: WorkflowVersion,
    current_user: UserProfile | User,
    *,
    scope: str = "mine",
) -> bool:
    if scope == "all":
        return _is_admin_user(current_user)
    if scope == "mine":
        return _workflow_owner_user_id(row) == current_user.id
    return can_access_by_visibility(
        _workflow_visibility(row),
        _workflow_owner_user_id(row),
        current_user_id=current_user.id,
        is_admin=_is_admin_user(current_user),
    )


def _dataset_summary(
    row: Dataset,
    *,
    latest_version: DatasetVersion | None = None,
) -> DatasetSummary:
    metadata = latest_version.metadata_json if latest_version else {}
    return DatasetSummary(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        description=row.description,
        kind=row.kind,
        status=row.status,
        is_private=_is_private_version_metadata(metadata),
        projection=row.projection,
        footprint=row.footprint,
        visibility=_dataset_visibility(metadata),
        owner_user_id=_dataset_owner_user_id(metadata),
        owner_display_name=_dataset_owner_display_name(metadata),
        latest_version_id=latest_version.id if latest_version else None,
        latest_version_number=latest_version.version if latest_version else None,
        updated_at=row.updated_at,
    )


def _dataset_version_summary(row: DatasetVersion) -> DatasetVersionSummary:
    metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
    return DatasetVersionSummary(
        id=row.id,
        dataset_id=row.dataset_id,
        version=row.version,
        status=row.status,
        asset_path=row.asset_path,
        preview_url=row.preview_url,
        bbox=row.bbox,
        metadata=metadata,
        is_private=_is_private_version_metadata(metadata),
        visibility=_dataset_visibility(metadata),
        owner_user_id=_dataset_owner_user_id(metadata),
        owner_display_name=_dataset_owner_display_name(metadata),
        created_at=row.created_at,
    )


def _workflow_input_asset_version_ids(row: WorkflowRun) -> list[str]:
    metrics_payload = row.metrics_json if isinstance(row.metrics_json, dict) else {}
    raw_input_ids = metrics_payload.get("input_asset_version_ids")
    if isinstance(raw_input_ids, list):
        return _unique_string_values(raw_input_ids)

    references = metrics_payload.get("references")
    candidate_values: list[object] = []
    if isinstance(references, dict):
        candidate_values.append(references.get("input_dataset_version_id"))
    candidate_values.append(row.input_dataset_version_id)
    return _unique_string_values(candidate_values)


def _workflow_output_asset_version_ids(row: WorkflowRun) -> list[str]:
    metrics_payload = row.metrics_json if isinstance(row.metrics_json, dict) else {}
    candidate_values: list[object] = []

    raw_output_ids = metrics_payload.get("output_asset_version_ids")
    if isinstance(raw_output_ids, list):
        candidate_values.extend(raw_output_ids)

    saved_dataset_version_ids = metrics_payload.get("saved_dataset_version_ids")
    if isinstance(saved_dataset_version_ids, list):
        candidate_values.extend(saved_dataset_version_ids)

    candidate_values.append(row.result_dataset_version_id)
    return _unique_string_values(candidate_values)


def _workflow_primary_output_asset_version_id(row: WorkflowRun) -> str | None:
    metrics_payload = row.metrics_json if isinstance(row.metrics_json, dict) else {}
    explicit_output_id = str(
        metrics_payload.get("primary_output_asset_version_id", "")
    ).strip()
    return explicit_output_id or row.result_dataset_version_id


def _workflow_run_summary(
    row: WorkflowRun,
    submitted_by: str,
    workflow_name: str | None = None,
) -> WorkflowRunSummary:
    metrics_payload = row.metrics_json if isinstance(row.metrics_json, dict) else {}
    return WorkflowRunSummary(
        id=row.id,
        workflow_version_id=row.workflow_version_id,
        workflow_name=workflow_name,
        status=row.status,
        submitted_by=submitted_by,
        result_dataset_version_id=row.result_dataset_version_id,
        input_asset_version_ids=_workflow_input_asset_version_ids(row),
        output_asset_version_ids=_workflow_output_asset_version_ids(row),
        primary_output_asset_version_id=_workflow_primary_output_asset_version_id(row),
        error_message=(
            str(metrics_payload.get("error", "")).strip()
            if isinstance(metrics_payload.get("error"), str)
            else None
        ),
        metrics=(
            metrics_payload.get("metrics", metrics_payload)
            if isinstance(metrics_payload.get("metrics", metrics_payload), dict)
            else {}
        ),
        started_at=row.started_at,
        finished_at=row.finished_at,
    )


def _model_version_summary(row: ModelVersion, model_name: str | None = None) -> ModelVersionSummary:
    metadata = dict(row.metadata_json) if isinstance(row.metadata_json, dict) else {}
    public_metadata = _sanitize_model_metadata(metadata)
    feature_names = metadata.get("feature_names", [])
    default_parameters = metadata.get("default_parameters", {})
    return ModelVersionSummary(
        id=row.id,
        model_id=row.model_id,
        model_name=model_name,
        algorithm_key=str(metadata.get("algorithm_key", "")).strip() or None,
        version=row.version,
        framework=row.framework,
        task_type=row.task_type,
        weights_path=row.weights_path,
        feature_names=[
            str(item) for item in feature_names if isinstance(item, str) and item.strip()
        ],
        default_parameters=(
            dict(default_parameters) if isinstance(default_parameters, dict) else {}
        ),
        artifact_format=str(metadata.get("artifact_format", "")).strip() or None,
        source_type=str(metadata.get("source_type", "uploaded")).strip() or "uploaded",
        execution_mode=str(metadata.get("execution_mode", "in_process")).strip() or "in_process",
        visibility=_model_visibility(metadata),
        owner_user_id=_model_owner_user_id(metadata),
        owner_display_name=_model_owner_display_name(metadata),
        metadata=public_metadata,
        created_at=row.created_at,
    )


def _workflow_version_summary(row: WorkflowVersion) -> WorkflowVersionSummary:
    return WorkflowVersionSummary(
        id=row.id,
        workflow_id=row.workflow_id,
        version=row.version,
        graph=WorkflowGraph.model_validate(row.graph_json),
        visibility=_workflow_visibility(row),
        owner_user_id=_workflow_owner_user_id(row),
        owner_display_name=_workflow_owner_display_name(row),
        created_at=row.created_at,
    )


def _workspace_summary(db: Session, row: Workspace) -> WorkspaceSummary:
    member_count = db.scalar(
        select(func.count())
        .select_from(WorkspaceMembership)
        .where(WorkspaceMembership.workspace_id == row.id)
    )
    return WorkspaceSummary(
        id=row.id,
        name=row.name,
        slug=row.slug,
        description=row.description,
        member_count=member_count or 0,
    )


def list_workspaces(db: Session) -> list[WorkspaceSummary]:
    rows = db.scalars(select(Workspace).order_by(Workspace.created_at.asc())).all()
    return [_workspace_summary(db, row) for row in rows]


def list_gee_credentials(
    db: Session,
    current_user: UserProfile | User,
    *,
    scope: str = "mine",
) -> list[GeeCredentialSummary]:
    rows = db.scalars(select(GeeCredential).order_by(GeeCredential.created_at.desc())).all()
    platform_default_credential_id = _platform_default_gee_credential_id(db)
    if scope == "all":
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can list all GEE credentials.")
    elif scope == "mine":
        rows = [row for row in rows if row.owner_user_id == current_user.id]
    else:
        rows = [row for row in rows if _can_access_gee_credential(row, current_user)]

    owner_ids = {row.owner_user_id for row in rows}
    owner_names = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_(owner_ids))).all()
    }
    return [
        _gee_credential_summary(
            row,
            owner_names.get(row.owner_user_id),
            is_platform_default=row.id == platform_default_credential_id,
        )
        for row in rows
    ]


def create_gee_credential(
    db: Session,
    *,
    request: GeeCredentialCreateRequest,
    current_user: UserProfile | User,
) -> GeeCredentialSummary:
    name = request.name.strip()
    if not name:
        raise ValueError("Credential name is required.")

    try:
        payload = json.loads(request.service_account_json)
    except json.JSONDecodeError as exc:
        raise ValueError("service_account_json must be valid JSON.") from exc

    if not isinstance(payload, dict):
        raise ValueError("service_account_json must be a JSON object.")

    service_account_email = str(payload.get("client_email", "")).strip()
    private_key = str(payload.get("private_key", "")).strip()
    if not service_account_email or not private_key:
        raise ValueError(
            "service_account_json must include client_email and private_key fields."
        )

    credential = GeeCredential(
        workspace_id=request.workspace_id,
        owner_user_id=current_user.id,
        name=name,
        provider="gee",
        description=request.description.strip(),
        project_id=(
            request.project_id.strip()
            if isinstance(request.project_id, str) and request.project_id.strip()
            else str(payload.get("project_id", "")).strip() or None
        ),
        service_account_json=json.dumps(payload, indent=2),
    )
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return _gee_credential_summary(
        credential,
        current_user.display_name,
        is_platform_default=False,
    )


def delete_gee_credential(
    db: Session,
    credential_id: str,
    *,
    current_user: UserProfile | User,
) -> None:
    row = db.get(GeeCredential, credential_id)
    if row is None:
        raise LookupError("GEE credential not found.")
    if not _can_access_gee_credential(row, current_user):
        raise PermissionError("You do not have access to this GEE credential.")
    if not _is_admin_user(current_user) and row.owner_user_id != current_user.id:
        raise PermissionError(
            "Only the owner or an administrator can delete this GEE credential."
        )
    platform_default_setting = _platform_setting(db, PLATFORM_DEFAULT_GEE_CREDENTIAL_KEY)
    if platform_default_setting and _platform_default_gee_credential_id(db) == row.id:
        db.delete(platform_default_setting)
    db.delete(row)
    db.commit()


def set_platform_default_gee_credential(
    db: Session,
    credential_id: str,
    *,
    current_user: UserProfile | User,
) -> GeeCredentialSummary:
    if not _is_admin_user(current_user):
        raise PermissionError("Only administrators can set the platform default GEE credential.")

    row = db.get(GeeCredential, credential_id)
    if row is None:
        raise LookupError("GEE credential not found.")

    setting = _platform_setting(db, PLATFORM_DEFAULT_GEE_CREDENTIAL_KEY)
    if setting is None:
        setting = PlatformSetting(
            key=PLATFORM_DEFAULT_GEE_CREDENTIAL_KEY,
            value_json={"credential_id": row.id},
        )
        db.add(setting)
    else:
        setting.value_json = {"credential_id": row.id}

    db.commit()
    owner = db.get(User, row.owner_user_id)
    return _gee_credential_summary(
        row,
        owner.display_name if owner is not None else None,
        is_platform_default=True,
    )


def resolve_gee_credential_config(
    db: Session,
    *,
    current_user: UserProfile | User,
    credential_mode: str,
    personal_credential_id: str | None,
) -> gee_runtime.GeeCredentialConfig:
    settings = get_settings()
    if credential_mode == "platform_default":
        default_credential_id = _platform_default_gee_credential_id(db)
        if default_credential_id:
            row = db.get(GeeCredential, default_credential_id)
            if row is not None:
                return gee_runtime.GeeCredentialConfig(
                    source="platform_default",
                    name=row.name,
                    service_account_json=row.service_account_json,
                    project_id=row.project_id,
                )

        if settings.gee_service_account_json.strip():
            return gee_runtime.GeeCredentialConfig(
                source="platform_default",
                name="Platform Default GEE Credential",
                service_account_json=settings.gee_service_account_json,
                project_id=settings.gee_project.strip() or None,
            )
        if not settings.gee_enabled:
            raise ValueError("Platform GEE integration is disabled.")
        raise ValueError("The platform default GEE credential is not configured.")

    if credential_mode != "personal":
        raise ValueError("Unsupported GEE credential mode.")
    if not personal_credential_id:
        raise ValueError("personalCredentialId is required for personal GEE credentials.")

    row = db.get(GeeCredential, personal_credential_id)
    if row is None:
        raise LookupError("The selected personal GEE credential was not found.")
    if not _can_access_gee_credential(row, current_user):
        raise PermissionError("You do not have access to the selected GEE credential.")
    return gee_runtime.GeeCredentialConfig(
        source="personal",
        name=row.name,
        service_account_json=row.service_account_json,
        project_id=row.project_id,
    )


def list_datasets(
    db: Session,
    current_user: UserProfile | User | None = None,
    *,
    scope: str = "visible",
    visibility: str | None = None,
) -> list[DatasetSummary]:
    rows = db.scalars(select(Dataset).order_by(Dataset.updated_at.desc())).all()
    visible_rows: list[DatasetSummary] = []
    for row in rows:
        latest_version = _latest_dataset_version(db, row.id)
        if latest_version is None:
            continue

        row_visibility = _dataset_visibility(latest_version.metadata_json)
        owner_user_id = _dataset_owner_user_id(latest_version.metadata_json)

        if visibility and row_visibility != visibility:
            continue

        if scope == "mine":
            if current_user is None or owner_user_id != current_user.id:
                continue
        elif scope == "all":
            if not _is_admin_user(current_user):
                raise PermissionError("Only administrators can list all datasets.")
        else:
            if not _can_access_dataset_version(latest_version, current_user):
                continue

        visible_rows.append(_dataset_summary(row, latest_version=latest_version))
    return visible_rows


def get_dataset(
    db: Session,
    dataset_id: str,
    current_user: UserProfile | User | None = None,
) -> DatasetSummary | None:
    row = db.get(Dataset, dataset_id)
    if row is None:
        return None
    latest_version = _latest_dataset_version(db, dataset_id)
    if latest_version is None or not _can_access_dataset_version(latest_version, current_user):
        return None
    return _dataset_summary(row, latest_version=latest_version)


def list_dataset_versions(
    db: Session,
    current_user: UserProfile | User | None = None,
    dataset_id: str | None = None,
    *,
    scope: str = "visible",
    visibility: str | None = None,
) -> list[DatasetVersionSummary]:
    query = select(DatasetVersion)
    if dataset_id is not None:
        query = query.where(DatasetVersion.dataset_id == dataset_id)
    rows = db.scalars(query.order_by(DatasetVersion.created_at.desc())).all()
    summaries: list[DatasetVersionSummary] = []
    for row in rows:
        row_visibility = _dataset_visibility(row.metadata_json)
        owner_user_id = _dataset_owner_user_id(row.metadata_json)

        if visibility and row_visibility != visibility:
            continue

        if scope == "mine":
            if current_user is None or owner_user_id != current_user.id:
                continue
        elif scope == "all":
            if not _is_admin_user(current_user):
                raise PermissionError("Only administrators can list all dataset versions.")
        else:
            if not _can_access_dataset_version(row, current_user):
                continue

        summaries.append(_dataset_version_summary(row))
    return summaries


def get_dataset_version(
    db: Session,
    dataset_version_id: str,
    current_user: UserProfile | User | None = None,
) -> DatasetVersionSummary | None:
    row = db.get(DatasetVersion, dataset_version_id)
    if row is None or not _can_access_dataset_version(row, current_user):
        return None
    return _dataset_version_summary(row)


def get_dataset_version_file(
    db: Session,
    dataset_version_id: str,
    current_user: UserProfile | User | None = None,
) -> tuple[Path, str, str] | None:
    row = db.get(DatasetVersion, dataset_version_id)
    if row is None or not _can_access_dataset_version(row, current_user):
        return None
    file_path = Path(row.asset_path)
    if not file_path.is_absolute():
        file_path = Path.cwd() / file_path
    return file_path, row.original_file_name, row.content_type


def update_dataset(
    db: Session,
    dataset_id: str,
    *,
    current_user: UserProfile | User,
    name: str | None = None,
    description: str | None = None,
    original_file_name: str | None = None,
    content_type: str | None = None,
    row_count: int | None = None,
    columns: list[str] | None = None,
    sample_record: dict[str, object] | None = None,
    visibility: str | None = None,
) -> DatasetSummary:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise LookupError("Dataset not found.")

    versions = db.scalars(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset_id)
        .order_by(DatasetVersion.version.desc(), DatasetVersion.created_at.desc())
    ).all()
    if not versions:
        raise LookupError("Dataset version not found.")

    latest_version = versions[0]
    if not _can_manage_dataset(latest_version.metadata_json, current_user):
        raise PermissionError("Only the owner or an administrator can manage this dataset.")

    next_name = name.strip() if name is not None else None
    if next_name is not None:
        if not next_name:
            raise ValueError("Dataset name cannot be empty.")
        dataset.name = next_name

    if description is not None:
        dataset.description = description.strip()

    latest_metadata = (
        dict(latest_version.metadata_json)
        if isinstance(latest_version.metadata_json, dict)
        else {}
    )
    metadata_changed = False

    if original_file_name is not None:
        normalized_file_name = original_file_name.strip()
        if normalized_file_name:
            latest_metadata["original_file_name"] = normalized_file_name
        else:
            latest_metadata.pop("original_file_name", None)
        metadata_changed = True

    if content_type is not None:
        normalized_content_type = content_type.strip()
        if normalized_content_type:
            latest_metadata["content_type"] = normalized_content_type
        else:
            latest_metadata.pop("content_type", None)
        metadata_changed = True

    if row_count is not None:
        if row_count < 0:
            raise ValueError("Row count cannot be negative.")
        latest_metadata["row_count"] = row_count
        metadata_changed = True

    if columns is not None:
        normalized_columns = [item.strip() for item in columns if item and item.strip()]
        if normalized_columns:
            latest_metadata["columns"] = normalized_columns
        else:
            latest_metadata.pop("columns", None)
        metadata_changed = True

    if sample_record is not None:
        if sample_record:
            latest_metadata["sample_record"] = sample_record
            latest_metadata["sample_rows"] = [sample_record]
        else:
            latest_metadata.pop("sample_record", None)
            latest_metadata.pop("sample_rows", None)
        metadata_changed = True

    if visibility is not None:
        normalized_visibility = visibility.strip().lower()
        if normalized_visibility not in {"private", "public"}:
            raise ValueError("Dataset visibility must be either 'private' or 'public'.")
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can change dataset visibility.")
        for version in versions:
            metadata = (
                dict(version.metadata_json) if isinstance(version.metadata_json, dict) else {}
            )
            metadata["visibility"] = normalized_visibility
            version.metadata_json = metadata

    if metadata_changed:
        latest_version.metadata_json = latest_metadata

    dataset.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(dataset)
    refreshed_latest_version = _latest_dataset_version(db, dataset.id)
    return _dataset_summary(dataset, latest_version=refreshed_latest_version)


def _cleanup_deleted_asset(file_path: Path) -> None:
    try:
        if file_path.exists():
            file_path.unlink()
    except OSError:
        return

    storage_root = _storage_root().resolve()
    current = file_path.parent
    while current != storage_root and current.exists():
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def delete_dataset(
    db: Session,
    dataset_id: str,
    *,
    current_user: UserProfile | User,
) -> None:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise LookupError("Dataset not found.")

    versions = db.scalars(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset_id)
        .order_by(DatasetVersion.version.desc(), DatasetVersion.created_at.desc())
    ).all()
    if not versions:
        raise LookupError("Dataset version not found.")

    latest_version = versions[0]
    if not _can_manage_dataset(latest_version.metadata_json, current_user):
        raise PermissionError("Only the owner or an administrator can delete this dataset.")

    version_ids = [version.id for version in versions]
    input_run_count = db.scalar(
        select(func.count())
        .select_from(WorkflowRun)
        .where(WorkflowRun.input_dataset_version_id.in_(version_ids))
    )
    if input_run_count:
        raise ValueError("This dataset is referenced by workflow runs and cannot be deleted.")

    split_input_count = db.scalar(
        select(func.count())
        .select_from(SplitJob)
        .where(SplitJob.dataset_version_id.in_(version_ids))
    )
    if split_input_count:
        raise ValueError("This dataset is referenced by split jobs and cannot be deleted.")

    result_runs = db.scalars(
        select(WorkflowRun).where(WorkflowRun.result_dataset_version_id.in_(version_ids))
    ).all()
    for run in result_runs:
        run.result_dataset_version_id = None

    split_outputs = db.scalars(
        select(SplitJob).where(SplitJob.output_dataset_version_id.in_(version_ids))
    ).all()
    for split_job in split_outputs:
        split_job.output_dataset_version_id = None

    asset_paths = []
    for version in versions:
        file_path = Path(version.asset_path)
        if not file_path.is_absolute():
            file_path = Path.cwd() / file_path
        asset_paths.append(file_path)
        db.delete(version)

    db.delete(dataset)
    db.commit()

    for file_path in asset_paths:
        _cleanup_deleted_asset(file_path)


def create_upload_session(
    *,
    workspace_id: str,
    dataset_name: str,
    file_name: str,
    content_type: str,
) -> UploadSessionResponse:
    safe_name = _slugify(file_name)
    object_key = f"uploads/{workspace_id}/{_slugify(dataset_name)}/{uuid4()}-{safe_name}"
    upload_url = f"{get_settings().api_v1_prefix}/datasets/upload"
    return UploadSessionResponse(
        object_key=object_key,
        upload_url=upload_url,
        headers={"X-Upload-Object-Key": object_key, "X-Upload-Content-Type": content_type},
    )


def _next_dataset_version_number(db: Session, dataset_id: str) -> int:
    current = db.scalar(
        select(func.max(DatasetVersion.version)).where(DatasetVersion.dataset_id == dataset_id)
    )
    return (current or 0) + 1


def create_dataset_upload(
    db: Session,
    *,
    workspace_id: str,
    dataset_name: str,
    description: str | None,
    kind: DatasetKind,
    current_user: UserProfile | User,
    upload_file: BinaryIO,
    original_file_name: str,
    content_type: str,
    size_bytes: int,
) -> DatasetVersionSummary:
    current_user_id = current_user.id
    current_user_display_name = (
        current_user.display_name
        if isinstance(current_user, UserProfile)
        else current_user.display_name
    )
    normalized_description = description.strip() if description is not None else ""

    dataset = None
    candidate_rows = db.scalars(
        select(Dataset)
        .where(
            Dataset.workspace_id == workspace_id,
            Dataset.name == dataset_name,
            Dataset.kind == kind,
        )
        .order_by(Dataset.updated_at.desc())
    ).all()
    for candidate in candidate_rows:
        latest_version = _latest_dataset_version(db, candidate.id)
        if latest_version is None:
            continue
        if _dataset_owner_user_id(latest_version.metadata_json) == current_user_id:
            dataset = candidate
            break

    if dataset is None:
        dataset = Dataset(
            workspace_id=workspace_id,
            name=dataset_name,
            kind=kind,
            status=DatasetStatus.READY,
            description=normalized_description,
        )
        db.add(dataset)
        db.flush()
    else:
        dataset.status = DatasetStatus.READY
        if description is not None:
            dataset.description = normalized_description

    version_number = _next_dataset_version_number(db, dataset.id)
    target_dir = (
        _storage_root()
        / "workspaces"
        / workspace_id
        / "datasets"
        / dataset.id
        / f"v{version_number}"
    )
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4()}-{_slugify(original_file_name)}"
    target_path = target_dir / stored_name

    with target_path.open("wb") as output:
        shutil.copyfileobj(upload_file, output)

    metadata_json: dict[str, object] = {
        "content_type": content_type or "application/octet-stream",
        "size_bytes": size_bytes,
        "original_file_name": original_file_name,
        "visibility": "private",
        "owner_user_id": current_user_id,
        "owner_display_name": current_user_display_name,
    }
    if kind == DatasetKind.TABLE and original_file_name.lower().endswith(".csv"):
        try:
            metadata_json.update(summarize_csv_file(target_path))
        except (OSError, UnicodeDecodeError, csv.Error):
            metadata_json["csv_summary_error"] = "Failed to summarize CSV."

    version = DatasetVersion(
        dataset_id=dataset.id,
        version=version_number,
        status=DatasetStatus.READY,
        asset_path=str(target_path.resolve()),
        preview_url=None,
        original_file_name=original_file_name,
        content_type=content_type or "application/octet-stream",
        size_bytes=size_bytes,
        metadata_json=metadata_json,
    )
    db.add(version)
    db.flush()
    version.preview_url = f"{get_settings().api_v1_prefix}/dataset-versions/{version.id}/download"

    db.add(
        JobLog(
            job_type="dataset_upload",
            reference_id=version.id,
            status=JobStatus.SUCCEEDED,
            message=f"Uploaded {original_file_name} ({size_bytes} bytes).",
        )
    )
    db.commit()
    db.refresh(dataset)
    db.refresh(version)
    return _dataset_version_summary(version)


def confirm_upload(
    db: Session,
    request: DatasetUploadConfirmRequest,
    current_user: UserProfile | User,
) -> DatasetVersionSummary:
    path = Path(request.object_key)
    size_bytes = path.stat().st_size if path.exists() else 0
    with path.open("rb") as uploaded_file:
        return create_dataset_upload(
            db,
            workspace_id=request.workspace_id,
            dataset_name=request.dataset_name,
            description=None,
            kind=request.kind,
            current_user=current_user,
            upload_file=uploaded_file,
            original_file_name=path.name,
            content_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            size_bytes=size_bytes,
        )


def create_private_dataset_version(
    *,
    db: Session,
    workspace_id: str,
    current_user: User,
    run_id: str,
    dataset_name: str,
    kind: DatasetKind,
    source_path: Path,
    content_type: str,
    bbox: list[float] | None = None,
    dataset_description: str | None = None,
    metadata: dict[str, object] | None = None,
) -> DatasetVersionSummary:
    dataset = Dataset(
        workspace_id=workspace_id,
        name=dataset_name,
        kind=kind,
        status=DatasetStatus.READY,
        description=dataset_description or "Workflow-generated private output.",
    )
    db.add(dataset)
    db.flush()

    target_dir = _storage_root() / "workspaces" / workspace_id / "datasets" / dataset.id / "v1"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / source_path.name
    shutil.copyfile(source_path, target_path)
    size_bytes = target_path.stat().st_size

    version_metadata: dict[str, object] = {
        "visibility": "private",
        "owner_user_id": current_user.id,
        "owner_display_name": current_user.display_name,
        "workflow_run_id": run_id,
        "original_file_name": source_path.name,
        "content_type": content_type,
        "size_bytes": size_bytes,
        **(metadata or {}),
    }
    if kind == DatasetKind.TABLE and source_path.suffix.lower() == ".csv":
        try:
            version_metadata.update(summarize_csv_file(target_path))
        except (OSError, UnicodeDecodeError, csv.Error):
            version_metadata["csv_summary_error"] = "Failed to summarize CSV."

    version = DatasetVersion(
        dataset_id=dataset.id,
        version=1,
        status=DatasetStatus.READY,
        asset_path=str(target_path.resolve()),
        preview_url=None,
        original_file_name=source_path.name,
        content_type=content_type,
        size_bytes=size_bytes,
        bbox=bbox,
        metadata_json=version_metadata,
    )
    db.add(version)
    db.flush()
    version.preview_url = f"{get_settings().api_v1_prefix}/dataset-versions/{version.id}/download"
    db.flush()
    return _dataset_version_summary(version)


def _ensure_model_record(
    db: Session,
    *,
    workspace_id: str,
    model_name: str,
    task_type: str,
    description: str,
) -> Model:
    model = db.scalar(
        select(Model).where(
            Model.workspace_id == workspace_id,
            Model.name == model_name,
            Model.task_type == task_type,
        )
    )
    if model is None:
        model = Model(
            workspace_id=workspace_id,
            name=model_name,
            task_type=task_type,
            description=description,
        )
        db.add(model)
        db.flush()
        return model

    if description:
        model.description = description
    db.flush()
    return model


def create_model_upload(
    db: Session,
    *,
    workspace_id: str,
    model_name: str,
    version: str,
    algorithm_key: str,
    task_type: str,
    framework: str,
    feature_names: list[str],
    default_parameters: dict[str, object],
    current_user: UserProfile | User,
    upload_file: BinaryIO,
    original_file_name: str,
) -> ModelVersionSummary:
    target_dir = (
        _storage_root() / "workspaces" / workspace_id / "models" / _slugify(model_name) / version
    )
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{uuid4()}-{_slugify(original_file_name)}"

    with target_path.open("wb") as output:
        shutil.copyfileobj(upload_file, output)

    task_type, framework, metadata_json = create_tabular_model_metadata(
        file_path=target_path,
        original_file_name=original_file_name,
        algorithm_key=algorithm_key,
        framework=framework,
        task_type=task_type,
        feature_names=feature_names,
        default_parameters=default_parameters,
    )
    metadata_json.update(
        {
            "source_type": "uploaded",
            "execution_mode": "in_process",
            "visibility": "private",
            "owner_user_id": current_user.id,
            "owner_display_name": current_user.display_name,
        }
    )

    model = _ensure_model_record(
        db,
        workspace_id=workspace_id,
        model_name=model_name,
        task_type=task_type,
        description="Uploaded tabular regression model.",
    )

    model_version = ModelVersion(
        model_id=model.id,
        version=version,
        framework=framework,
        task_type=task_type,
        weights_path=str(target_path.resolve()),
        metadata_json=metadata_json,
    )
    db.add(model_version)
    db.add(
        JobLog(
            job_type="model_upload",
            reference_id=model.id,
            status=JobStatus.SUCCEEDED,
            message=(
                f"Uploaded {metadata_json.get('algorithm_key', algorithm_key)} model "
                f"{model_name} {version}."
            ),
        )
    )
    db.commit()
    db.refresh(model)
    db.refresh(model_version)
    return _model_version_summary(model_version, model.name)


def create_private_model_version(
    db: Session,
    *,
    workspace_id: str,
    current_user: UserProfile | User,
    model_name: str,
    version: str,
    algorithm_key: str,
    task_type: str,
    framework: str,
    source_path: Path,
    metadata: dict[str, object] | None = None,
) -> ModelVersionSummary:
    model = _ensure_model_record(
        db,
        workspace_id=workspace_id,
        model_name=model_name,
        task_type=task_type,
        description="Platform-trained tabular regression model.",
    )
    model_version = ModelVersion(
        model_id=model.id,
        version=version,
        framework=framework,
        task_type=task_type,
        weights_path=str(source_path.resolve()),
        metadata_json={
            "algorithm_key": algorithm_key,
            "source_type": "trained",
            "execution_mode": "in_process",
            "visibility": "private",
            "owner_user_id": current_user.id,
            "owner_display_name": current_user.display_name,
            **(metadata or {}),
        },
    )
    db.add(model_version)
    db.flush()
    return _model_version_summary(model_version, model.name)


def create_custom_api_model(
    db: Session,
    *,
    request: CustomApiModelCreateRequest,
    current_user: UserProfile | User,
) -> ModelVersionSummary:
    if not request.endpoint_url.strip():
        raise ValueError("endpoint_url is required.")
    if request.auth_type == "header" and not (request.auth_header_name or "").strip():
        raise ValueError("auth_header_name is required when auth_type is 'header'.")

    model = _ensure_model_record(
        db,
        workspace_id=request.workspace_id,
        model_name=request.model_name,
        task_type=request.task_type,
        description=request.description or "External API backed custom model.",
    )

    target_dir = (
        _storage_root()
        / "workspaces"
        / request.workspace_id
        / "models"
        / _slugify(request.model_name)
        / request.version
    )
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{uuid4()}-custom-api-model.json"
    api_config = {
        "endpoint_url": request.endpoint_url.strip(),
        "timeout_seconds": request.timeout_seconds,
        "auth_type": request.auth_type,
        "auth_token": request.auth_token or "",
        "auth_header_name": request.auth_header_name or "",
        "response_mode": request.response_mode,
        "default_prediction_column": request.default_prediction_column.strip() or "prediction",
        "default_parameters": dict(request.default_parameters),
    }
    target_path.write_text(json.dumps(api_config, indent=2), encoding="utf-8")

    model_version = ModelVersion(
        model_id=model.id,
        version=request.version,
        framework="http-api",
        task_type=request.task_type,
        weights_path=str(target_path.resolve()),
        metadata_json={
            "kind": "custom_api_model",
            "source_type": "custom_api",
            "execution_mode": "external_api",
            "artifact_format": "json",
            "visibility": "private",
            "owner_user_id": current_user.id,
            "owner_display_name": current_user.display_name,
            "default_parameters": dict(request.default_parameters),
            "api_config": api_config,
        },
    )
    db.add(model_version)
    db.add(
        JobLog(
            job_type="model_create",
            reference_id=model.id,
            status=JobStatus.SUCCEEDED,
            message=f"Created custom API model {request.model_name} {request.version}.",
        )
    )
    db.commit()
    db.refresh(model)
    db.refresh(model_version)
    return _model_version_summary(model_version, model.name)


def list_workflow_catalog() -> list[WorkflowCatalogItem]:
    return BUILTIN_NODE_CATALOG


def list_workflow_templates() -> list[WorkflowTemplateDefinition]:
    return workflow_templates()


def list_workflows(db: Session) -> list[WorkflowSummary]:
    rows = db.scalars(select(Workflow).order_by(Workflow.created_at.asc())).all()
    return [
        WorkflowSummary(
            id=row.id,
            workspace_id=row.workspace_id,
            name=row.name,
            description=row.description,
        )
        for row in rows
    ]


def _default_personal_workflow_graph() -> dict[str, object]:
    templates = workflow_templates()
    if templates:
        return templates[0].graph.model_dump(mode="json")
    return {"nodes": [], "edges": []}


def _ensure_workflow_owner_metadata(
    graph_json: dict[str, object],
    current_user: UserProfile | User,
) -> dict[str, object]:
    metadata = _workflow_metadata(graph_json)
    metadata["visibility"] = "private"
    metadata["owner_user_id"] = current_user.id
    metadata["owner_display_name"] = (
        current_user.display_name
        if isinstance(current_user, UserProfile)
        else current_user.display_name
    )
    graph_json["metadata"] = metadata
    return graph_json


def _first_workflow(db: Session) -> Workflow | None:
    return db.scalar(select(Workflow).order_by(Workflow.created_at.asc()))


def _next_workflow_version_number(db: Session, workflow_id: str) -> int:
    current = db.scalar(
        select(func.max(WorkflowVersion.version)).where(WorkflowVersion.workflow_id == workflow_id)
    )
    return (current or 0) + 1


def _create_personal_workflow_version(
    db: Session,
    *,
    current_user: UserProfile | User,
    graph_json: dict[str, object] | None = None,
) -> WorkflowVersionSummary:
    workflow = _first_workflow(db)
    workspace = db.scalar(select(Workspace).order_by(Workspace.created_at.asc()))
    if workflow is None:
        if workspace is None:
            raise LookupError("Workflow definition is not initialized.")
        workflow = Workflow(
            workspace_id=workspace.id,
            name="Personal Workflow",
            description="User-scoped workflow definition.",
        )
        db.add(workflow)
        db.flush()

    saved = WorkflowVersion(
        workflow_id=workflow.id,
        version=_next_workflow_version_number(db, workflow.id),
        graph_json=_ensure_workflow_owner_metadata(
            graph_json or _default_personal_workflow_graph(),
            current_user,
        ),
    )
    db.add(saved)
    db.flush()
    db.commit()
    db.refresh(saved)
    return _workflow_version_summary(saved)


def get_current_workflow_version(
    db: Session,
    current_user: UserProfile | User,
) -> WorkflowVersionSummary:
    row = db.scalar(
        select(WorkflowVersion).order_by(
            WorkflowVersion.created_at.desc(),
        )
    )
    if row is not None:
        owned_rows = db.scalars(
            select(WorkflowVersion).order_by(WorkflowVersion.created_at.desc())
        ).all()
        for candidate in owned_rows:
            if _workflow_owner_user_id(candidate) == current_user.id:
                return _workflow_version_summary(candidate)

    return _create_personal_workflow_version(db, current_user=current_user)


def save_current_workflow_version(
    db: Session,
    graph: WorkflowGraph,
    current_user: UserProfile | User,
) -> WorkflowVersionSummary:
    workflow = _first_workflow(db)
    workspace = db.scalar(select(Workspace).order_by(Workspace.created_at.asc()))
    if workflow is None:
        if workspace is None:
            raise LookupError("Workflow definition is not initialized.")
        workflow = Workflow(
            workspace_id=workspace.id,
            name="Personal Workflow",
            description="User-scoped workflow definition.",
        )
        db.add(workflow)
        db.flush()

    saved = WorkflowVersion(
        workflow_id=workflow.id,
        version=_next_workflow_version_number(db, workflow.id),
        graph_json=_ensure_workflow_owner_metadata(graph.model_dump(mode="json"), current_user),
    )
    db.add(saved)
    db.flush()
    db.add(
        JobLog(
            job_type="workflow_save",
            reference_id=saved.id,
            status=JobStatus.SUCCEEDED,
            message=f"Saved workflow version {saved.version}.",
        )
    )
    db.commit()
    db.refresh(saved)
    return _workflow_version_summary(saved)


def list_workflow_versions(
    db: Session,
    current_user: UserProfile | User,
    *,
    scope: str = "mine",
) -> list[WorkflowVersionSummary]:
    rows = db.scalars(select(WorkflowVersion).order_by(WorkflowVersion.created_at.desc())).all()
    if scope == "all" and not _is_admin_user(current_user):
        raise PermissionError("Only administrators can list all workflow versions.")
    return [
        _workflow_version_summary(row)
        for row in rows
        if _can_access_workflow_version(row, current_user, scope=scope)
    ]


def get_workflow_version(
    db: Session,
    workflow_version_id: str,
    current_user: UserProfile | User,
) -> WorkflowVersionSummary | None:
    row = db.get(WorkflowVersion, workflow_version_id)
    if row is None:
        return None
    if not _can_access_workflow_version(row, current_user, scope="visible"):
        return None
    return _workflow_version_summary(row)


def get_workflow_version_download_payload(
    db: Session,
    workflow_version_id: str,
    current_user: UserProfile | User,
) -> tuple[str, str] | None:
    row = db.get(WorkflowVersion, workflow_version_id)
    if row is None:
        return None
    if not _can_access_workflow_version(row, current_user, scope="visible"):
        return None
    file_name = f"workflow-version-{row.version}.json"
    payload = json.dumps(row.graph_json, indent=2, ensure_ascii=False)
    return payload, file_name


def update_workflow_version(
    db: Session,
    workflow_version_id: str,
    *,
    visibility: str | None,
    current_user: UserProfile | User,
) -> WorkflowVersionSummary:
    row = db.get(WorkflowVersion, workflow_version_id)
    if row is None:
        raise LookupError("Workflow version not found.")

    if visibility is not None:
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can change workflow visibility.")
        metadata = _workflow_metadata(row.graph_json)
        metadata["visibility"] = normalize_visibility(visibility, default="private")
        graph_json = dict(row.graph_json) if isinstance(row.graph_json, dict) else {}
        row.graph_json = {
            **graph_json,
            "metadata": metadata,
        }

    db.commit()
    db.refresh(row)
    return _workflow_version_summary(row)


def import_workflow_version(
    db: Session,
    graph: WorkflowGraph,
    current_user: UserProfile | User,
) -> WorkflowVersionSummary:
    return save_current_workflow_version(db, graph, current_user)


def test_workflow_node(
    db: Session,
    graph: WorkflowGraph,
    node_id: str,
    current_user: UserProfile | User,
) -> WorkflowNodeTestResponse:
    started = perf_counter()
    resolved_graph = resolve_saved_rois_in_workflow_graph(
        db,
        graph,
        current_user=current_user,
    )
    graph_json = resolved_graph.model_dump(mode="json")
    target_node = next((node for node in resolved_graph.nodes if node.id == node_id), None)
    target_node_type = target_node.type if target_node is not None else ""

    def resolve_credential(
        mode: str,
        personal_credential_id: str | None,
    ) -> gee_runtime.GeeCredentialConfig:
        return resolve_gee_credential_config(
            db,
            current_user=current_user,
            credential_mode=mode,
            personal_credential_id=personal_credential_id,
        )

    try:
        if gee_runtime.supports_gee_node(target_node_type):
            result = gee_runtime.test_gee_node(
                graph_json=graph_json,
                target_node_id=node_id,
                resolve_credential=resolve_credential,
            )
        else:
            result = test_tabular_node(
                db=db,
                graph_json=graph_json,
                target_node_id=node_id,
                storage_root=_storage_root(),
            )
    except NotImplementedError as exc:
        return WorkflowNodeTestResponse(
            status="not_supported",
            node_id=node_id,
            duration_ms=int((perf_counter() - started) * 1000),
            errors=[str(exc)],
        )
    except Exception as exc:
        return WorkflowNodeTestResponse(
            status="failed",
            node_id=node_id,
            duration_ms=int((perf_counter() - started) * 1000),
            errors=[str(exc)],
        )

    return WorkflowNodeTestResponse(
        status="succeeded",
        node_id=result["node_id"],
        duration_ms=int((perf_counter() - started) * 1000),
        input_preview=result["input_preview"],
        output_preview=result["output_preview"],
    )


def delete_workflow_version(
    db: Session,
    workflow_version_id: str,
    *,
    current_user: UserProfile | User,
) -> None:
    row = db.get(WorkflowVersion, workflow_version_id)
    if row is None:
        raise LookupError("Workflow version not found.")
    if not can_manage_owned_asset(
        _workflow_owner_user_id(row),
        current_user_id=current_user.id,
        is_admin=_is_admin_user(current_user),
    ):
        raise PermissionError(
            "Only the owner or an administrator can delete this workflow version."
        )
    db.delete(row)
    db.commit()


def list_workflow_runs(
    db: Session,
    current_user: UserProfile | User,
    *,
    scope: str = "visible",
) -> list[WorkflowRunSummary]:
    rows = db.scalars(select(WorkflowRun).order_by(WorkflowRun.created_at.desc())).all()
    if scope == "all" and not _is_admin_user(current_user):
        raise PermissionError("Only administrators can list all workflow runs.")
    if scope == "mine":
        rows = [row for row in rows if row.submitted_by == current_user.id]
    elif scope != "all" and not _is_admin_user(current_user):
        rows = [row for row in rows if row.submitted_by == current_user.id]
    user_ids = {row.submitted_by for row in rows}
    users = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_(user_ids))).all()
    }
    workflow_version_ids = {row.workflow_version_id for row in rows}
    workflow_versions = db.scalars(
        select(WorkflowVersion).where(WorkflowVersion.id.in_(workflow_version_ids))
    ).all()
    workflow_id_by_version_id = {row.id: row.workflow_id for row in workflow_versions}
    workflow_ids = set(workflow_id_by_version_id.values())
    workflows = {
        row.id: row.name
        for row in db.scalars(
            select(Workflow).where(Workflow.id.in_(workflow_ids))
        ).all()
    }
    return [
        _workflow_run_summary(
            row,
            users.get(row.submitted_by, row.submitted_by),
            workflows.get(workflow_id_by_version_id.get(row.workflow_version_id, "")),
        )
        for row in rows
    ]


def _write_run_artifact(run_id: str, payload: dict[str, object]) -> Path:
    target_dir = _storage_root() / "workflow-runs" / run_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / "result-summary.json"
    target_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target_path


def _metadata_upstream_asset_version_ids(metadata: dict[str, object]) -> list[str]:
    candidate_values: list[object] = []

    raw_upstream_ids = metadata.get("upstream_asset_version_ids")
    if isinstance(raw_upstream_ids, list):
        candidate_values.extend(raw_upstream_ids)

    raw_input_ids = metadata.get("input_asset_version_ids")
    if isinstance(raw_input_ids, list):
        candidate_values.extend(raw_input_ids)

    for key in ("input_dataset_version_id", "source_dataset_version_id"):
        candidate_values.append(metadata.get(key))

    return _unique_string_values(candidate_values)


def _attach_workflow_run_lineage_to_dataset_versions(
    db: Session,
    *,
    run: WorkflowRun,
    workflow_version_id: str,
    output_dataset_version_ids: list[str],
    input_asset_version_ids: list[str],
    model_version_id: str | None,
) -> None:
    normalized_input_ids = _unique_string_values(list(input_asset_version_ids))
    normalized_output_ids = _unique_string_values(list(output_dataset_version_ids))

    for dataset_version_id in normalized_output_ids:
        row = db.get(DatasetVersion, dataset_version_id)
        if row is None:
            continue

        metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
        merged_metadata = dict(metadata)
        merged_metadata["source_execution_id"] = run.id
        merged_metadata["workflow_run_id"] = run.id
        merged_metadata["source_workflow_version_id"] = workflow_version_id
        merged_metadata["upstream_asset_version_ids"] = _unique_string_values(
            [
                *_metadata_upstream_asset_version_ids(merged_metadata),
                *normalized_input_ids,
            ]
        )
        if model_version_id:
            merged_metadata["model_version_id"] = model_version_id
        if len(normalized_input_ids) == 1 and not merged_metadata.get("input_dataset_version_id"):
            merged_metadata["input_dataset_version_id"] = normalized_input_ids[0]

        row.metadata_json = merged_metadata
        db.add(row)


def _extract_run_references(graph_json: dict[str, object]) -> tuple[str | None, str | None]:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list):
        raise LookupError("Workflow graph is invalid.")

    dataset_version_id: str | None = None
    model_version_id: str | None = None

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type", ""))
        params = node.get("params", {})
        if not isinstance(params, dict):
            continue

        if dataset_version_id is None and node_type == "source.dataset_version":
            candidate = str(params.get("datasetVersionId", "")).strip()
            if candidate:
                dataset_version_id = candidate

        if model_version_id is None:
            if node_type == "source.model_version":
                candidate = str(params.get("modelVersionId", "")).strip()
                if candidate:
                    model_version_id = candidate
            if node_type in {
                "tabular.predict",
                "tabular.linear_regression_predict",
                "tabular.svm_regression_predict",
                "tabular.random_forest_regression_predict",
                "custom.api_predict",
            }:
                candidate = str(params.get("modelVersionId", "")).strip()
                if candidate:
                    model_version_id = candidate

    return dataset_version_id, model_version_id


def _fallback_dataset_version(db: Session) -> DatasetVersion | None:
    return db.scalar(select(DatasetVersion).order_by(DatasetVersion.created_at.asc()))


def _fallback_model_version(db: Session) -> ModelVersion | None:
    return db.scalar(select(ModelVersion).order_by(ModelVersion.created_at.asc()))


def _complete_placeholder_workflow_run(
    *,
    db: Session,
    run: WorkflowRun,
    current_user: User,
    workspace_id: str,
    workflow_version: WorkflowVersion,
    dataset_version: DatasetVersion | None,
    model_version: ModelVersion | None,
) -> None:
    artifact_path = _write_run_artifact(
        run.id,
        {
            "run_id": run.id,
            "workflow_version_id": workflow_version.id,
            "input_dataset_version_id": dataset_version.id if dataset_version else None,
            "model_version_id": model_version.id if model_version else None,
            "submitted_by": current_user.display_name,
            "generated_at": datetime.now(UTC).isoformat(),
        },
    )

    result_dataset = Dataset(
        workspace_id=workspace_id,
        name=f"Workflow Result {run.id[:8]}",
        kind=DatasetKind.ARTIFACT,
        status=DatasetStatus.READY,
        description="Generated artifact for a persisted workflow run.",
    )
    db.add(result_dataset)
    db.flush()

    result_version = DatasetVersion(
        dataset_id=result_dataset.id,
        version=1,
        status=DatasetStatus.READY,
        asset_path=str(artifact_path.resolve()),
        preview_url=f"{get_settings().api_v1_prefix}/dataset-versions/{{pending}}/download",
        original_file_name=artifact_path.name,
        content_type="application/json",
        size_bytes=artifact_path.stat().st_size,
        metadata_json={
            "source_run_id": run.id,
            "input_dataset_version_id": dataset_version.id if dataset_version else None,
            "model_version_id": model_version.id if model_version else None,
            "visibility": "private",
            "owner_user_id": current_user.id,
            "owner_display_name": current_user.display_name,
            "original_file_name": artifact_path.name,
            "content_type": "application/json",
            "size_bytes": artifact_path.stat().st_size,
        },
    )
    db.add(result_version)
    db.flush()
    result_version.preview_url = (
        f"{get_settings().api_v1_prefix}/dataset-versions/{result_version.id}/download"
    )

    ensure_workflow_run_transition(run.status, WorkflowRunStatus.SUCCEEDED)
    run.status = WorkflowRunStatus.SUCCEEDED
    run.finished_at = datetime.now(UTC)
    run.result_dataset_version_id = result_version.id

    db.add(
        JobLog(
            job_type="workflow_run",
            reference_id=run.id,
            status=JobStatus.SUCCEEDED,
            message=(
                f"Workflow run {run.id} completed and produced dataset version {result_version.id}."
            ),
        )
    )


def create_workflow_run(
    db: Session,
    request: WorkflowRunRequest,
    current_user: User,
) -> WorkflowRunAccepted:
    workflow_version = db.get(WorkflowVersion, request.workflow_version_id)
    if workflow_version is None:
        raise LookupError("Workflow version was not found.")
    if not _can_access_workflow_version(workflow_version, current_user, scope="visible"):
        raise PermissionError("You do not have access to this workflow version.")

    graph_json = (
        workflow_version.graph_json if isinstance(workflow_version.graph_json, dict) else {}
    )
    resolved_graph = resolve_saved_rois_in_workflow_graph(
        db,
        WorkflowGraph.model_validate(graph_json),
        current_user=current_user,
    )
    graph_json = resolved_graph.model_dump(mode="json")
    gee_graph_supported = gee_runtime.is_supported_gee_graph(graph_json)
    dataset_version_id, model_version_id = _extract_run_references(graph_json)
    if not dataset_version_id and not gee_graph_supported:
        raise LookupError("Workflow graph does not declare an input dataset version.")

    dataset_version = db.get(DatasetVersion, dataset_version_id) if dataset_version_id else None
    if dataset_version_id and dataset_version is None:
        raise LookupError(f"Dataset version not found: {dataset_version_id}")
    fallback_dataset_version = dataset_version or _fallback_dataset_version(db)
    if fallback_dataset_version is None:
        raise LookupError(
            "No dataset version is available to associate with this workflow run."
        )

    model_version = db.get(ModelVersion, model_version_id) if model_version_id else None
    if model_version_id and model_version is None:
        raise LookupError(f"Model version not found: {model_version_id}")

    fallback_model_version = model_version or _fallback_model_version(db)
    if fallback_model_version is None:
        raise LookupError("No model version is available to associate with this workflow run.")

    input_asset_version_ids = (
        [dataset_version.id] if dataset_version is not None else []
    )

    def resolve_credential(
        mode: str,
        personal_credential_id: str | None,
    ) -> gee_runtime.GeeCredentialConfig:
        return resolve_gee_credential_config(
            db,
            current_user=current_user,
            credential_mode=mode,
            personal_credential_id=personal_credential_id,
        )

    run = WorkflowRun(
        workflow_version_id=workflow_version.id,
        input_dataset_version_id=fallback_dataset_version.id,
        model_version_id=fallback_model_version.id,
        status=WorkflowRunStatus.QUEUED,
        submitted_by=current_user.id,
        started_at=datetime.now(UTC),
        metrics_json={
            "priority": request.priority,
            "input_asset_version_ids": input_asset_version_ids,
            "output_asset_version_ids": [],
            "primary_output_asset_version_id": None,
            "references": {
                "input_dataset_version_id": dataset_version.id if dataset_version else None,
                "model_version_id": model_version.id if model_version else None,
                "workflow_runtime": (
                    "gee"
                    if gee_graph_supported
                    else "tabular"
                    if is_supported_tabular_graph(graph_json)
                    else "placeholder"
                ),
            },
        },
    )
    db.add(run)
    db.flush()
    error_message: str | None = None

    try:
        ensure_workflow_run_transition(run.status, WorkflowRunStatus.RUNNING)
        run.status = WorkflowRunStatus.RUNNING
        if is_supported_tabular_graph(graph_json):
            runtime_result = execute_tabular_graph(
                db=db,
                workflow_version=workflow_version,
                current_user=current_user,
                workspace_id=request.workspace_id,
                run_id=run.id,
                storage_root=_storage_root(),
                create_private_dataset_version=create_private_dataset_version,
                create_private_model_version=create_private_model_version,
            )
            ensure_workflow_run_transition(run.status, WorkflowRunStatus.SUCCEEDED)
            run.status = WorkflowRunStatus.SUCCEEDED
            run.finished_at = datetime.now(UTC)
            run.result_dataset_version_id = runtime_result["result_dataset_version_id"]
            output_dataset_version_ids = _unique_string_values(
                [
                    *(runtime_result["saved_dataset_version_ids"] or []),
                    run.result_dataset_version_id,
                ]
            )
            run.metrics_json = {
                **run.metrics_json,
                "metrics": runtime_result["metrics"],
                "saved_dataset_version_ids": runtime_result["saved_dataset_version_ids"],
                "saved_model_version_ids": runtime_result["saved_model_version_ids"],
                "result_model_version_id": runtime_result["result_model_version_id"],
                "artifact_path": runtime_result["artifact_path"],
                "output_asset_version_ids": output_dataset_version_ids,
                "primary_output_asset_version_id": run.result_dataset_version_id,
            }
            _attach_workflow_run_lineage_to_dataset_versions(
                db,
                run=run,
                workflow_version_id=workflow_version.id,
                output_dataset_version_ids=output_dataset_version_ids,
                input_asset_version_ids=input_asset_version_ids,
                model_version_id=model_version.id if model_version is not None else None,
            )
            db.add(
                JobLog(
                    job_type="workflow_run",
                    reference_id=run.id,
                    status=JobStatus.SUCCEEDED,
                    message=f"Executed tabular workflow run {run.id}.",
                )
            )
        elif gee_graph_supported:
            runtime_result = gee_runtime.execute_gee_graph(
                db=db,
                workflow_version=workflow_version,
                graph_json=graph_json,
                current_user=current_user,
                workspace_id=request.workspace_id,
                run_id=run.id,
                storage_root=_storage_root(),
                resolve_credential=resolve_credential,
                create_private_dataset_version=create_private_dataset_version,
            )
            ensure_workflow_run_transition(run.status, WorkflowRunStatus.SUCCEEDED)
            run.status = WorkflowRunStatus.SUCCEEDED
            run.finished_at = datetime.now(UTC)
            run.result_dataset_version_id = runtime_result["result_dataset_version_id"]
            output_dataset_version_ids = _unique_string_values(
                [
                    *(runtime_result["saved_dataset_version_ids"] or []),
                    run.result_dataset_version_id,
                ]
            )
            run.metrics_json = {
                **run.metrics_json,
                "metrics": runtime_result["metrics"],
                "saved_dataset_version_ids": runtime_result["saved_dataset_version_ids"],
                "saved_model_version_ids": runtime_result["saved_model_version_ids"],
                "result_model_version_id": runtime_result["result_model_version_id"],
                "artifact_path": runtime_result["artifact_path"],
                "output_asset_version_ids": output_dataset_version_ids,
                "primary_output_asset_version_id": run.result_dataset_version_id,
            }
            _attach_workflow_run_lineage_to_dataset_versions(
                db,
                run=run,
                workflow_version_id=workflow_version.id,
                output_dataset_version_ids=output_dataset_version_ids,
                input_asset_version_ids=input_asset_version_ids,
                model_version_id=model_version.id if model_version is not None else None,
            )
            db.add(
                JobLog(
                    job_type="workflow_run",
                    reference_id=run.id,
                    status=JobStatus.SUCCEEDED,
                    message=f"Executed Sentinel GEE workflow run {run.id}.",
                )
            )
        else:
            _complete_placeholder_workflow_run(
                db=db,
                run=run,
                current_user=current_user,
                workspace_id=request.workspace_id,
                workflow_version=workflow_version,
                dataset_version=dataset_version or fallback_dataset_version,
                model_version=model_version,
            )
            _attach_workflow_run_lineage_to_dataset_versions(
                db,
                run=run,
                workflow_version_id=workflow_version.id,
                output_dataset_version_ids=[run.result_dataset_version_id]
                if run.result_dataset_version_id
                else [],
                input_asset_version_ids=input_asset_version_ids,
                model_version_id=model_version.id if model_version is not None else None,
            )
            run.metrics_json = {
                **run.metrics_json,
                "output_asset_version_ids": (
                    [run.result_dataset_version_id] if run.result_dataset_version_id else []
                ),
                "primary_output_asset_version_id": run.result_dataset_version_id,
            }
        db.commit()
    except Exception as exc:
        ensure_workflow_run_transition(run.status, WorkflowRunStatus.FAILED)
        run.status = WorkflowRunStatus.FAILED
        run.finished_at = datetime.now(UTC)
        error_message = str(exc).strip() or "Workflow execution failed."
        run.metrics_json = {
            **run.metrics_json,
            "error": error_message,
            "output_asset_version_ids": [],
            "primary_output_asset_version_id": None,
        }
        db.add(
            JobLog(
                job_type="workflow_run",
                reference_id=run.id,
                status=JobStatus.FAILED,
                message=f"Workflow run {run.id} failed: {error_message}",
            )
        )
        db.commit()

    return WorkflowRunAccepted(
        id=run.id,
        workflow_version_id=run.workflow_version_id,
        status=run.status,
        submitted_by=current_user.display_name,
        error_message=error_message,
    )


def list_models(
    db: Session,
    current_user: UserProfile | User | None = None,
    *,
    scope: str = "visible",
) -> list[ModelSummary]:
    rows = db.scalars(select(Model).order_by(Model.created_at.asc())).all()
    versions = db.scalars(select(ModelVersion)).all()
    versions_by_model_id: dict[str, list[ModelVersion]] = {}
    for version in versions:
        versions_by_model_id.setdefault(version.model_id, []).append(version)

    visible_rows: list[ModelSummary] = []
    for row in rows:
        model_versions = versions_by_model_id.get(row.id, [])
        if not model_versions:
            continue

        if scope == "all":
            if not _is_admin_user(current_user):
                raise PermissionError("Only administrators can list all models.")
        elif scope == "mine":
            if current_user is None:
                continue
            if not any(
                _model_owner_user_id(item.metadata_json) == current_user.id
                for item in model_versions
            ):
                continue
        elif not any(_can_access_model_version(item, current_user) for item in model_versions):
            continue

        visible_rows.append(
            ModelSummary(
                id=row.id,
                workspace_id=row.workspace_id,
                name=row.name,
                task_type=row.task_type,
                description=row.description,
            )
        )
    return visible_rows


def list_model_versions(
    db: Session,
    current_user: UserProfile | User | None = None,
    *,
    scope: str = "visible",
) -> list[ModelVersionSummary]:
    rows = db.scalars(select(ModelVersion).order_by(ModelVersion.created_at.asc())).all()
    if scope == "all" and not _is_admin_user(current_user):
        raise PermissionError("Only administrators can list all model versions.")

    if scope == "mine":
        if current_user is None:
            rows = []
        else:
            rows = [
                row
                for row in rows
                if _model_owner_user_id(row.metadata_json) == current_user.id
            ]
    elif scope != "all":
        rows = [row for row in rows if _can_access_model_version(row, current_user)]

    model_names = {
        row.id: row.name
        for row in db.scalars(
            select(Model).where(Model.id.in_({item.model_id for item in rows}))
        ).all()
    }
    return [_model_version_summary(row, model_names.get(row.model_id)) for row in rows]


def get_model_version_download_payload(
    db: Session,
    model_version_id: str,
    *,
    current_user: UserProfile | User | None,
) -> tuple[bytes, str, str] | None:
    row = db.get(ModelVersion, model_version_id)
    if row is None or not _can_access_model_version(row, current_user):
        return None

    file_path = Path(row.weights_path)
    if not file_path.exists():
        raise LookupError("Model artifact file not found.")

    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    return file_path.read_bytes(), file_path.name, media_type


def update_model_version(
    db: Session,
    model_version_id: str,
    *,
    visibility: str | None,
    current_user: UserProfile | User | None,
) -> ModelVersionSummary:
    row = db.get(ModelVersion, model_version_id)
    if row is None:
        raise LookupError("Model version not found.")
    if current_user is None:
        raise PermissionError("Authentication is required.")

    metadata = dict(row.metadata_json) if isinstance(row.metadata_json, dict) else {}

    if visibility is not None:
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can change model visibility.")
        metadata["visibility"] = normalize_visibility(
            visibility,
            default=_model_visibility(metadata),
            allow_workspace=True,
        )

    row.metadata_json = metadata
    db.add(row)
    db.commit()
    db.refresh(row)

    model = db.get(Model, row.model_id)
    return _model_version_summary(row, model.name if model is not None else None)


def delete_model_version(
    db: Session,
    model_version_id: str,
    *,
    current_user: UserProfile | User | None,
) -> None:
    row = db.get(ModelVersion, model_version_id)
    if row is None:
        raise LookupError("Model version not found.")
    if not _can_access_model_version(row, current_user):
        raise PermissionError("You do not have access to this model version.")
    if (
        not can_manage_owned_asset(
            _model_owner_user_id(row.metadata_json),
            current_user_id=current_user.id if current_user is not None else None,
            is_admin=_is_admin_user(current_user),
        )
    ):
        raise PermissionError("Only the owner or an administrator can delete this model version.")

    file_path = Path(row.weights_path)
    db.delete(row)
    db.commit()
    try:
        if file_path.exists():
            file_path.unlink()
    except OSError:
        pass


def list_jobs(db: Session) -> list[JobSummary]:
    rows = db.scalars(select(JobLog).order_by(JobLog.created_at.desc())).all()
    return [
        JobSummary(
            id=row.id,
            job_type=row.job_type,
            reference_id=row.reference_id,
            status=row.status,
            message=row.message,
            created_at=row.created_at,
        )
        for row in rows
    ]


def list_splits(db: Session) -> list[SplitJobSummary]:
    rows = db.scalars(select(SplitJob).order_by(SplitJob.created_at.desc())).all()
    return [
        SplitJobSummary(
            id=row.id,
            workspace_id=row.workspace_id,
            dataset_version_id=row.dataset_version_id,
            status=row.status,
            tile_size=int(row.params_json.get("tile_size", 512)),
            overlap=int(row.params_json.get("overlap", 64)),
            split_strategy=str(row.params_json.get("split_strategy", "train-val-test")),
            created_at=row.created_at,
        )
        for row in rows
    ]


def create_split(db: Session, request: SplitJobRequest) -> SplitJobSummary:
    source_version = db.get(DatasetVersion, request.dataset_version_id)
    if source_version is None:
        raise LookupError("Dataset version not found.")

    split_job = SplitJob(
        workspace_id=request.workspace_id,
        dataset_version_id=request.dataset_version_id,
        status=JobStatus.SUCCEEDED,
        params_json={
            "tile_size": request.tile_size,
            "overlap": request.overlap,
            "split_strategy": request.split_strategy,
        },
    )
    db.add(split_job)
    db.add(
        JobLog(
            job_type="split_job",
            reference_id=source_version.id,
            status=JobStatus.SUCCEEDED,
            message=(
                f"Recorded split request with tile size {request.tile_size} "
                f"and overlap {request.overlap}."
            ),
        )
    )
    db.commit()
    db.refresh(split_job)
    return SplitJobSummary(
        id=split_job.id,
        workspace_id=split_job.workspace_id,
        dataset_version_id=split_job.dataset_version_id,
        status=split_job.status,
        tile_size=request.tile_size,
        overlap=request.overlap,
        split_strategy=request.split_strategy,
        created_at=split_job.created_at,
    )


def tile_preview(db: Session, dataset_version_id: str) -> TilePreviewResponse:
    version = db.get(DatasetVersion, dataset_version_id)
    return TilePreviewResponse(
        dataset_version_id=dataset_version_id,
        tilejson_url=f"{get_settings().tile_base_url}/datasets/{dataset_version_id}/tilejson.json",
        bounds=version.bbox if version else None,
    )
