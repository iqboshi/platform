from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field

from platform_backend.domain_enums import WorkflowRunStatus
from platform_backend.schemas.platform import GeeCredentialSummary, ModelVersionSummary
from platform_backend.schemas.spatial import SpatialRoiSummary

AssetType = Literal["dataset", "workflow", "model", "product", "spatial"]
ExecutionType = Literal["workflow_run"]
LineageRelationship = Literal["execution_output"]
AssetCapability = Literal[
    "downloadable",
    "publishable",
    "workflow_input_ready",
    "workflow_roi_ready",
    "map_overlay_ready",
    "lineage_tracked",
    "execution_output",
]
AssetConsumer = Literal[
    "workflow_dataset",
    "workflow_roi",
    "workflow_model",
    "workflow_gee_credential",
    "map_overlay",
]
AssetFormat = Literal[
    "csv",
    "geojson",
    "geotiff",
    "json",
    "workflow_graph",
    "roi_geometry",
    "unknown",
]
AssetInputCandidateType = Literal[
    "asset_version",
    "spatial_roi",
    "model_version",
    "gee_credential",
]


class AssetRef(BaseModel):
    id: str
    asset_type: AssetType = Field(
        validation_alias=AliasChoices("asset_type", "assetType"),
    )
    asset_kind: str = Field(
        validation_alias=AliasChoices("asset_kind", "assetKind"),
    )
    workspace_id: str = Field(
        validation_alias=AliasChoices("workspace_id", "workspaceId"),
    )
    name: str
    visibility: str = "private"
    owner_user_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("owner_user_id", "ownerUserId"),
    )
    owner_display_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("owner_display_name", "ownerDisplayName"),
    )


class SpatialAssetTraits(BaseModel):
    overlay_type: Literal["raster", "vector"] | None = Field(
        default=None,
        validation_alias=AliasChoices("overlay_type", "overlayType"),
    )
    bbox: list[float] | None = None
    preview_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("preview_url", "previewUrl"),
    )


class AssetVersionRef(BaseModel):
    id: str
    asset: AssetRef
    version_label: str = Field(
        validation_alias=AliasChoices("version_label", "versionLabel"),
    )
    version_number: int | None = Field(
        default=None,
        validation_alias=AliasChoices("version_number", "versionNumber"),
    )
    status: str | None = None
    created_at: datetime = Field(
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
    source_execution_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("source_execution_id", "sourceExecutionId"),
    )
    upstream_asset_version_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices(
            "upstream_asset_version_ids",
            "upstreamAssetVersionIds",
        ),
    )
    format: AssetFormat = "unknown"
    capabilities: list[AssetCapability] = Field(default_factory=list)
    consumable_by: list[AssetConsumer] = Field(
        default_factory=list,
        validation_alias=AliasChoices("consumable_by", "consumableBy"),
    )
    spatial_traits: SpatialAssetTraits | None = Field(
        default=None,
        validation_alias=AliasChoices("spatial_traits", "spatialTraits"),
    )


class ExecutionSummary(BaseModel):
    id: str
    execution_type: ExecutionType = Field(
        validation_alias=AliasChoices("execution_type", "executionType"),
    )
    status: WorkflowRunStatus
    submitted_by: str = Field(
        validation_alias=AliasChoices("submitted_by", "submittedBy"),
    )
    workflow_version_id: str = Field(
        validation_alias=AliasChoices("workflow_version_id", "workflowVersionId"),
    )
    workflow_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("workflow_name", "workflowName"),
    )
    input_asset_version_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices(
            "input_asset_version_ids",
            "inputAssetVersionIds",
        ),
    )
    output_asset_version_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices(
            "output_asset_version_ids",
            "outputAssetVersionIds",
        ),
    )
    primary_output_asset_version_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "primary_output_asset_version_id",
            "primaryOutputAssetVersionId",
        ),
    )
    metrics: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = Field(
        default=None,
        validation_alias=AliasChoices("error_message", "errorMessage"),
    )
    started_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("started_at", "startedAt"),
    )
    finished_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("finished_at", "finishedAt"),
    )


class LineageEdge(BaseModel):
    id: str
    relationship: LineageRelationship
    source_asset_version_id: str = Field(
        validation_alias=AliasChoices(
            "source_asset_version_id",
            "sourceAssetVersionId",
        ),
    )
    target_asset_version_id: str = Field(
        validation_alias=AliasChoices(
            "target_asset_version_id",
            "targetAssetVersionId",
        ),
    )
    execution_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("execution_id", "executionId"),
    )


class AssetFlowOverview(BaseModel):
    scope: Literal["mine", "visible", "all"]
    asset_versions: list[AssetVersionRef] = Field(
        default_factory=list,
        validation_alias=AliasChoices("asset_versions", "assetVersions"),
    )
    executions: list[ExecutionSummary] = Field(default_factory=list)
    lineage_edges: list[LineageEdge] = Field(
        default_factory=list,
        validation_alias=AliasChoices("lineage_edges", "lineageEdges"),
    )


class AssetInputCandidate(BaseModel):
    id: str
    consumer: AssetConsumer
    candidate_type: AssetInputCandidateType = Field(
        validation_alias=AliasChoices("candidate_type", "candidateType"),
    )
    title: str
    description: str | None = None
    asset_version: AssetVersionRef | None = Field(
        default=None,
        validation_alias=AliasChoices("asset_version", "assetVersion"),
    )
    spatial_roi: SpatialRoiSummary | None = Field(
        default=None,
        validation_alias=AliasChoices("spatial_roi", "spatialRoi"),
    )
    model_version: ModelVersionSummary | None = Field(
        default=None,
        validation_alias=AliasChoices("model_version", "modelVersion"),
    )
    gee_credential: GeeCredentialSummary | None = Field(
        default=None,
        validation_alias=AliasChoices("gee_credential", "geeCredential"),
    )
