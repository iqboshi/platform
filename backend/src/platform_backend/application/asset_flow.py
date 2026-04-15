from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.models.entities import Workflow
from platform_backend.schemas.asset_flow import (
    AssetConsumer,
    AssetFlowOverview,
    AssetFormat,
    AssetInputCandidate,
    AssetRef,
    AssetVersionRef,
    ExecutionSummary,
    LineageEdge,
    SpatialAssetTraits,
)
from platform_backend.schemas.platform import UserProfile
from platform_backend.services.platform_store import (
    list_dataset_versions,
    list_datasets,
    list_gee_credentials,
    list_model_versions,
    list_workflow_runs,
    list_workflow_versions,
)
from platform_backend.services.spatial_store import list_spatial_rois


def _normalize_scope(scope: str, *, allow_visible: bool = False) -> str:
    normalized_scope = scope.strip().lower() or "mine"
    allowed_scopes = {"mine", "all"}
    if allow_visible:
        allowed_scopes.add("visible")
    if normalized_scope not in allowed_scopes:
        allowed_text = "', '".join(sorted(allowed_scopes))
        raise ValueError(f"scope must be one of '{allowed_text}'.")
    return normalized_scope


def _normalize_consumer(consumer: str) -> AssetConsumer:
    normalized_consumer = consumer.strip().lower()
    if normalized_consumer not in {
        "map_overlay",
        "workflow_dataset",
        "workflow_roi",
        "workflow_model",
        "workflow_gee_credential",
    }:
        raise ValueError(
            "consumer must be one of 'map_overlay', 'workflow_dataset', 'workflow_roi', "
            "'workflow_model', or 'workflow_gee_credential'."
        )
    return normalized_consumer


def _unique_strings(values: list[object]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _extract_upstream_asset_version_ids(metadata: dict[str, object]) -> list[str]:
    upstream_values: list[object] = []

    raw_upstream_ids = metadata.get("upstream_asset_version_ids")
    if isinstance(raw_upstream_ids, list):
        upstream_values.extend(raw_upstream_ids)

    raw_input_ids = metadata.get("input_asset_version_ids")
    if isinstance(raw_input_ids, list):
        upstream_values.extend(raw_input_ids)

    for key in ("input_dataset_version_id", "source_dataset_version_id"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            upstream_values.append(value)

    return _unique_strings(upstream_values)


def _dataset_format(dataset_kind: str, metadata: dict[str, object]) -> AssetFormat:
    content_type = str(metadata.get("content_type", "")).strip().lower()
    original_file_name = str(metadata.get("original_file_name", "")).strip().lower()

    if dataset_kind == "vector" and (
        original_file_name.endswith(".geojson")
        or original_file_name.endswith(".json")
        or "geo+json" in content_type
        or content_type.endswith("/json")
    ):
        return "geojson"

    if dataset_kind == "raster" and (
        original_file_name.endswith(".tif")
        or original_file_name.endswith(".tiff")
        or "tiff" in content_type
        or "geotiff" in content_type
    ):
        return "geotiff"

    if dataset_kind == "table" and (original_file_name.endswith(".csv") or "csv" in content_type):
        return "csv"

    if original_file_name.endswith(".json") or "json" in content_type:
        return "json"

    return "unknown"


def _dataset_spatial_traits(
    *,
    dataset_kind: str,
    asset_format: AssetFormat,
    bbox: list[float] | None,
    preview_url: str | None,
) -> SpatialAssetTraits | None:
    if asset_format == "geotiff" and dataset_kind == "raster":
        return SpatialAssetTraits(
            overlay_type="raster",
            bbox=list(bbox) if bbox else None,
            preview_url=preview_url,
        )

    if asset_format == "geojson" and dataset_kind == "vector":
        return SpatialAssetTraits(
            overlay_type="vector",
            bbox=list(bbox) if bbox else None,
            preview_url=preview_url,
        )

    return None


def _dataset_capabilities(
    *,
    dataset_kind: str,
    source_execution_id: str | None,
    upstream_asset_version_ids: list[str],
    spatial_traits: SpatialAssetTraits | None,
) -> list[str]:
    capabilities: list[object] = ["downloadable", "publishable"]

    if dataset_kind in {"table", "raster", "vector"}:
        capabilities.append("workflow_input_ready")

    if spatial_traits is not None:
        capabilities.append("map_overlay_ready")

    if source_execution_id or upstream_asset_version_ids:
        capabilities.append("lineage_tracked")

    if source_execution_id:
        capabilities.append("execution_output")

    return _unique_strings(capabilities)


def _dataset_consumers(capabilities: list[str]) -> list[str]:
    consumers: list[object] = []
    if "workflow_input_ready" in capabilities:
        consumers.append("workflow_dataset")
    if "map_overlay_ready" in capabilities:
        consumers.append("map_overlay")
    return _unique_strings(consumers)


def _build_dataset_asset_version_ref(dataset, version) -> AssetVersionRef:
    metadata = version.metadata if isinstance(version.metadata, dict) else {}
    source_execution_id = (
        str(
            metadata.get("source_execution_id")
            or metadata.get("workflow_run_id")
            or metadata.get("source_run_id")
            or ""
        ).strip()
        or None
    )
    upstream_asset_version_ids = _extract_upstream_asset_version_ids(metadata)
    asset_format = _dataset_format(dataset.kind, metadata)
    spatial_traits = _dataset_spatial_traits(
        dataset_kind=dataset.kind,
        asset_format=asset_format,
        bbox=version.bbox,
        preview_url=version.preview_url,
    )
    capabilities = _dataset_capabilities(
        dataset_kind=dataset.kind,
        source_execution_id=source_execution_id,
        upstream_asset_version_ids=upstream_asset_version_ids,
        spatial_traits=spatial_traits,
    )
    consumers = _dataset_consumers(capabilities)

    return AssetVersionRef(
        id=version.id,
        asset=AssetRef(
            id=dataset.id,
            asset_type="dataset",
            asset_kind=dataset.kind,
            workspace_id=dataset.workspace_id,
            name=dataset.name,
            visibility=version.visibility or dataset.visibility or "private",
            owner_user_id=version.owner_user_id,
            owner_display_name=version.owner_display_name,
        ),
        version_label=f"v{version.version}",
        version_number=version.version,
        status=version.status,
        created_at=version.created_at,
        source_execution_id=source_execution_id,
        upstream_asset_version_ids=upstream_asset_version_ids,
        format=asset_format,
        capabilities=capabilities,
        consumable_by=consumers,
        spatial_traits=spatial_traits,
    )


def _build_workflow_asset_version_ref(workflow, version) -> AssetVersionRef:
    return AssetVersionRef(
        id=version.id,
        asset=AssetRef(
            id=version.workflow_id,
            asset_type="workflow",
            asset_kind="graph",
            workspace_id=workflow.workspace_id if workflow is not None else "",
            name=workflow.name if workflow is not None else "Workflow",
            visibility=version.visibility,
            owner_user_id=version.owner_user_id,
            owner_display_name=version.owner_display_name,
        ),
        version_label=f"v{version.version}",
        version_number=version.version,
        status="ready",
        created_at=version.created_at,
        source_execution_id=None,
        upstream_asset_version_ids=[],
        format="workflow_graph",
        capabilities=["downloadable", "publishable"],
        consumable_by=[],
        spatial_traits=None,
    )


def _asset_candidate_description(asset_version: AssetVersionRef) -> str | None:
    description_parts: list[str] = []
    if asset_version.source_execution_id:
        description_parts.append(f"Produced by workflow run {asset_version.source_execution_id}.")
    if asset_version.asset.owner_display_name:
        description_parts.append(f"Owner: {asset_version.asset.owner_display_name}.")
    if asset_version.spatial_traits and asset_version.spatial_traits.overlay_type:
        description_parts.append(
            f"Spatial overlay ready as {asset_version.spatial_traits.overlay_type}."
        )
    return " ".join(description_parts) or None


def _model_candidate_description(model_version) -> str | None:
    description_parts: list[str] = []
    if model_version.source_type:
        description_parts.append(f"Source: {model_version.source_type}.")
    if model_version.framework:
        description_parts.append(f"Framework: {model_version.framework}.")
    if model_version.owner_display_name:
        description_parts.append(f"Owner: {model_version.owner_display_name}.")
    return " ".join(description_parts) or None


def _gee_candidate_description(credential) -> str | None:
    description_parts: list[str] = []
    if credential.provider:
        description_parts.append(f"Provider: {credential.provider}.")
    if credential.project_id:
        description_parts.append(f"Project: {credential.project_id}.")
    if credential.is_platform_default:
        description_parts.append("Currently configured as the platform default credential.")
    elif credential.owner_display_name:
        description_parts.append(f"Owner: {credential.owner_display_name}.")
    return " ".join(description_parts) or None


def get_asset_flow_overview(
    db: Session,
    current_user: UserProfile,
    *,
    scope: str = "mine",
) -> AssetFlowOverview:
    normalized_scope = _normalize_scope(scope, allow_visible=True)
    dataset_summaries = list_datasets(db, current_user, scope=normalized_scope)
    dataset_version_summaries = list_dataset_versions(db, current_user, scope=normalized_scope)
    workflow_version_summaries = list_workflow_versions(db, current_user, scope=normalized_scope)
    workflow_run_summaries = list_workflow_runs(db, current_user, scope=normalized_scope)

    dataset_by_id = {item.id: item for item in dataset_summaries}
    workflow_ids = {item.workflow_id for item in workflow_version_summaries}
    workflow_rows = db.scalars(select(Workflow).where(Workflow.id.in_(workflow_ids))).all()
    workflow_by_id = {item.id: item for item in workflow_rows}

    asset_versions: list[AssetVersionRef] = []

    for version in dataset_version_summaries:
        dataset = dataset_by_id.get(version.dataset_id)
        if dataset is None:
            continue
        asset_versions.append(_build_dataset_asset_version_ref(dataset, version))

    for version in workflow_version_summaries:
        workflow = workflow_by_id.get(version.workflow_id)
        asset_versions.append(_build_workflow_asset_version_ref(workflow, version))

    executions = [
        ExecutionSummary(
            id=run.id,
            execution_type="workflow_run",
            status=run.status,
            submitted_by=run.submitted_by,
            workflow_version_id=run.workflow_version_id,
            workflow_name=run.workflow_name,
            input_asset_version_ids=run.input_asset_version_ids or [],
            output_asset_version_ids=run.output_asset_version_ids or [],
            primary_output_asset_version_id=run.primary_output_asset_version_id,
            metrics=run.metrics or {},
            error_message=run.error_message,
            started_at=run.started_at,
            finished_at=run.finished_at,
        )
        for run in workflow_run_summaries
    ]

    lineage_edges: list[LineageEdge] = []
    for execution in executions:
        for source_asset_version_id in execution.input_asset_version_ids:
            for target_asset_version_id in execution.output_asset_version_ids:
                lineage_edges.append(
                    LineageEdge(
                        id=(f"{execution.id}:{source_asset_version_id}:{target_asset_version_id}"),
                        relationship="execution_output",
                        source_asset_version_id=source_asset_version_id,
                        target_asset_version_id=target_asset_version_id,
                        execution_id=execution.id,
                    )
                )

    asset_versions.sort(key=lambda item: item.created_at, reverse=True)
    executions.sort(
        key=lambda item: (
            item.finished_at.isoformat()
            if item.finished_at is not None
            else item.started_at.isoformat()
            if item.started_at is not None
            else ""
        ),
        reverse=True,
    )

    return AssetFlowOverview(
        scope=normalized_scope,
        asset_versions=asset_versions,
        executions=executions,
        lineage_edges=lineage_edges,
    )


def list_asset_input_candidates(
    db: Session,
    current_user: UserProfile,
    *,
    consumer: str,
    scope: str = "visible",
) -> list[AssetInputCandidate]:
    normalized_consumer = _normalize_consumer(consumer)
    normalized_scope = _normalize_scope(scope, allow_visible=True)

    if normalized_consumer == "workflow_roi":
        roi_summaries = list_spatial_rois(db, current_user=current_user, scope=normalized_scope)
        roi_summaries.sort(key=lambda item: item.updated_at, reverse=True)
        return [
            AssetInputCandidate(
                id=f"spatial-roi:{roi.id}",
                consumer="workflow_roi",
                candidate_type="spatial_roi",
                title=roi.name,
                description=(
                    f"Owner: {roi.owner_display_name}."
                    if roi.owner_display_name
                    else "Saved ROI asset."
                ),
                spatial_roi=roi,
            )
            for roi in roi_summaries
        ]

    if normalized_consumer == "workflow_model":
        model_summaries = list_model_versions(db, current_user=current_user, scope=normalized_scope)
        model_summaries.sort(key=lambda item: item.created_at, reverse=True)
        return [
            AssetInputCandidate(
                id=f"model-version:{model_version.id}",
                consumer="workflow_model",
                candidate_type="model_version",
                title=(
                    f"{model_version.model_name or model_version.model_id}"
                    f" / {model_version.version}"
                ),
                description=_model_candidate_description(model_version),
                model_version=model_version,
            )
            for model_version in model_summaries
        ]

    if normalized_consumer == "workflow_gee_credential":
        credential_summaries = list_gee_credentials(
            db,
            current_user=current_user,
            scope=normalized_scope,
        )
        credential_summaries.sort(key=lambda item: item.created_at, reverse=True)
        return [
            AssetInputCandidate(
                id=f"gee-credential:{credential.id}",
                consumer="workflow_gee_credential",
                candidate_type="gee_credential",
                title=credential.name,
                description=_gee_candidate_description(credential),
                gee_credential=credential,
            )
            for credential in credential_summaries
        ]

    dataset_summaries = list_datasets(db, current_user, scope=normalized_scope)
    dataset_version_summaries = list_dataset_versions(db, current_user, scope=normalized_scope)
    dataset_by_id = {item.id: item for item in dataset_summaries}

    candidates: list[AssetInputCandidate] = []
    for version in dataset_version_summaries:
        dataset = dataset_by_id.get(version.dataset_id)
        if dataset is None:
            continue
        asset_version = _build_dataset_asset_version_ref(dataset, version)
        if normalized_consumer not in asset_version.consumable_by:
            continue
        candidates.append(
            AssetInputCandidate(
                id=f"asset-version:{asset_version.id}:{normalized_consumer}",
                consumer=normalized_consumer,
                candidate_type="asset_version",
                title=f"{asset_version.asset.name} {asset_version.version_label}",
                description=_asset_candidate_description(asset_version),
                asset_version=asset_version,
            )
        )

    candidates.sort(
        key=lambda item: (
            item.asset_version.created_at.isoformat() if item.asset_version is not None else ""
        ),
        reverse=True,
    )
    return candidates
