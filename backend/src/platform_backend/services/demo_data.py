from __future__ import annotations

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import uuid4

from platform_backend.domain_enums import (
    DatasetKind,
    DatasetStatus,
    JobStatus,
    RoleKey,
    WorkflowRunStatus,
)
from platform_backend.schemas.platform import (
    DatasetSummary,
    DatasetUploadConfirmRequest,
    DatasetUploadRequest,
    DatasetVersionSummary,
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
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowSummary,
    WorkflowVersionSummary,
)
from platform_backend.workflows.catalog import BUILTIN_NODE_CATALOG


def _ts(hours_ago: int) -> datetime:
    return datetime.now(UTC) - timedelta(hours=hours_ago)


@lru_cache(maxsize=1)
def current_user() -> UserProfile:
    return UserProfile(
        id="user-admin",
        email="admin@platform.local",
        display_name="Platform Admin",
        role=RoleKey.ADMIN,
    )


@lru_cache(maxsize=1)
def workspaces() -> list[WorkspaceSummary]:
    return [
        WorkspaceSummary(
            id="ws-earth-lab",
            name="Earth Observation Lab",
            slug="earth-observation-lab",
            description="Remote sensing datasets, workflows, and inference runs for the core team.",
            member_count=7,
        )
    ]


@lru_cache(maxsize=1)
def datasets() -> list[DatasetSummary]:
    return [
        DatasetSummary(
            id="dataset-s2-north",
            workspace_id="ws-earth-lab",
            name="Sentinel-2 Mosaic North Plot",
            kind=DatasetKind.RASTER,
            status=DatasetStatus.READY,
            bands=4,
            projection="EPSG:3857",
            footprint="POLYGON((...))",
            updated_at=_ts(2),
        ),
        DatasetSummary(
            id="dataset-boundaries",
            workspace_id="ws-earth-lab",
            name="Parcel Boundaries",
            kind=DatasetKind.VECTOR,
            status=DatasetStatus.READY,
            projection="EPSG:4326",
            footprint="POLYGON((...))",
            updated_at=_ts(6),
        ),
        DatasetSummary(
            id="dataset-inference-output",
            workspace_id="ws-earth-lab",
            name="Segmentation Predictions",
            kind=DatasetKind.ARTIFACT,
            status=DatasetStatus.PROCESSING,
            updated_at=_ts(1),
        ),
    ]


@lru_cache(maxsize=1)
def dataset_versions() -> list[DatasetVersionSummary]:
    return [
        DatasetVersionSummary(
            id="dsv-s2-v1",
            dataset_id="dataset-s2-north",
            version=1,
            status=DatasetStatus.READY,
            asset_path="s3://platform-dev/datasets/sentinel-2-north/v1/cog.tif",
            preview_url="/tiles/datasets/dsv-s2-v1/tilejson.json",
            bbox=[116.2, 39.7, 116.8, 40.2],
            metadata={"sensor": "Sentinel-2", "resolution_m": 10},
            created_at=_ts(48),
        ),
        DatasetVersionSummary(
            id="dsv-boundaries-v1",
            dataset_id="dataset-boundaries",
            version=1,
            status=DatasetStatus.READY,
            asset_path="s3://platform-dev/datasets/parcel-boundaries/v1/source.geojson",
            preview_url="/tiles/datasets/dsv-boundaries-v1/tilejson.json",
            bbox=[116.2, 39.7, 116.8, 40.2],
            metadata={"feature_count": 328},
            created_at=_ts(120),
        ),
    ]


@lru_cache(maxsize=1)
def workflow_catalog() -> list[WorkflowCatalogItem]:
    return BUILTIN_NODE_CATALOG


@lru_cache(maxsize=1)
def workflow_summary() -> WorkflowSummary:
    return WorkflowSummary(
        id="wf-segmentation-demo",
        workspace_id="ws-earth-lab",
        name="Segmentation Pipeline",
        description="COG preprocessing, tiled inference, and export for segmentation outputs.",
    )


@lru_cache(maxsize=1)
def workflow_version() -> WorkflowVersionSummary:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="node-source",
                type="source.dataset",
                position={"x": 0.0, "y": 80.0},
                params={"datasetVersionId": "dsv-s2-v1"},
                input_bindings={},
                output_defs=[WorkflowNodePort(key="image", label="Image")],
            ),
            WorkflowNode(
                id="node-preprocess",
                type="preprocess.cog",
                position={"x": 280.0, "y": 80.0},
                params={"normalize": True},
                input_bindings={"image": "node-source:image"},
                output_defs=[WorkflowNodePort(key="prepared", label="Prepared Raster")],
            ),
            WorkflowNode(
                id="node-split",
                type="split.grid",
                position={"x": 560.0, "y": 80.0},
                params={"tileSize": 512, "overlap": 64},
                input_bindings={"raster": "node-preprocess:prepared"},
                output_defs=[WorkflowNodePort(key="tiles", label="Tiles")],
            ),
            WorkflowNode(
                id="node-inference",
                type="inference.segmentation",
                position={"x": 840.0, "y": 80.0},
                params={"modelVersionId": "modelv-seg-unet-v1"},
                input_bindings={"tiles": "node-split:tiles"},
                output_defs=[WorkflowNodePort(key="predictions", label="Predictions")],
            ),
            WorkflowNode(
                id="node-export",
                type="postprocess.export",
                position={"x": 1120.0, "y": 80.0},
                params={"format": "GeoTIFF"},
                input_bindings={"artifact": "node-inference:predictions"},
                output_defs=[WorkflowNodePort(key="package", label="Package")],
            ),
        ],
        edges=[
            WorkflowEdge(id="edge-1", source="node-source", target="node-preprocess"),
            WorkflowEdge(id="edge-2", source="node-preprocess", target="node-split"),
            WorkflowEdge(id="edge-3", source="node-split", target="node-inference"),
            WorkflowEdge(id="edge-4", source="node-inference", target="node-export"),
        ],
    )
    return WorkflowVersionSummary(
        id="wfv-segmentation-demo-v1",
        workflow_id="wf-segmentation-demo",
        version=1,
        graph=graph,
        created_at=_ts(12),
    )


@lru_cache(maxsize=1)
def workflow_runs() -> list[WorkflowRunSummary]:
    return [
        WorkflowRunSummary(
            id="run-001",
            workflow_version_id="wfv-segmentation-demo-v1",
            status=WorkflowRunStatus.RUNNING,
            submitted_by="Platform Admin",
            started_at=_ts(1),
        ),
        WorkflowRunSummary(
            id="run-000",
            workflow_version_id="wfv-segmentation-demo-v1",
            status=WorkflowRunStatus.SUCCEEDED,
            submitted_by="Platform Admin",
            started_at=_ts(28),
            finished_at=_ts(27),
        ),
    ]


@lru_cache(maxsize=1)
def model_summaries() -> list[ModelSummary]:
    return [
        ModelSummary(
            id="model-seg-unet",
            workspace_id="ws-earth-lab",
            name="Field Segmentation UNet",
            task_type="segmentation",
            description="UNet variant for crop or parcel segmentation on multispectral tiles.",
        )
    ]


@lru_cache(maxsize=1)
def model_versions() -> list[ModelVersionSummary]:
    return [
        ModelVersionSummary(
            id="modelv-seg-unet-v1",
            model_id="model-seg-unet",
            version="1.0.0",
            framework="PyTorch",
            task_type="segmentation",
            weights_path="s3://platform-dev/models/field-segmentation-unet/1.0.0/model.pt",
            created_at=_ts(72),
        )
    ]


@lru_cache(maxsize=1)
def jobs() -> list[JobSummary]:
    return [
        JobSummary(
            id="job-ingest-001",
            job_type="dataset_ingest",
            reference_id="dsv-s2-v1",
            status=JobStatus.SUCCEEDED,
            message="COG conversion and metadata extraction completed.",
            created_at=_ts(45),
        ),
        JobSummary(
            id="job-run-001",
            job_type="workflow_run",
            reference_id="run-001",
            status=JobStatus.RUNNING,
            message="Inference tiles are being processed.",
            created_at=_ts(1),
        ),
    ]


@lru_cache(maxsize=1)
def split_jobs() -> list[SplitJobSummary]:
    return [
        SplitJobSummary(
            id="split-001",
            workspace_id="ws-earth-lab",
            dataset_version_id="dsv-s2-v1",
            status=JobStatus.SUCCEEDED,
            tile_size=512,
            overlap=64,
            split_strategy="train-val-test",
            created_at=_ts(20),
        )
    ]


def build_upload_session(request: DatasetUploadRequest) -> UploadSessionResponse:
    dataset_slug = request.dataset_name.replace(" ", "-").lower()
    object_key = f"datasets/{request.workspace_id}/{dataset_slug}/{request.file_name}"
    return UploadSessionResponse(
        object_key=object_key,
        upload_url=f"http://localhost:9000/platform-dev/{object_key}",
        headers={"Content-Type": request.content_type},
    )


def confirm_upload(request: DatasetUploadConfirmRequest) -> DatasetVersionSummary:
    return DatasetVersionSummary(
        id=f"dsv-{uuid4()}",
        dataset_id=f"dataset-{uuid4()}",
        version=1,
        status=DatasetStatus.UPLOADED,
        asset_path=f"s3://platform-dev/{request.object_key}",
        preview_url=None,
        bbox=None,
        metadata={"source": "upload-confirm", "kind": request.kind},
        created_at=datetime.now(UTC),
    )


def queue_split_job(request: SplitJobRequest) -> SplitJobSummary:
    return SplitJobSummary(
        id=f"split-{uuid4()}",
        workspace_id=request.workspace_id,
        dataset_version_id=request.dataset_version_id,
        status=JobStatus.PENDING,
        tile_size=request.tile_size,
        overlap=request.overlap,
        split_strategy=request.split_strategy,
        created_at=datetime.now(UTC),
    )


def tile_preview(dataset_version_id: str) -> TilePreviewResponse:
    version = next((item for item in dataset_versions() if item.id == dataset_version_id), None)
    return TilePreviewResponse(
        dataset_version_id=dataset_version_id,
        tilejson_url=f"/tiles/datasets/{dataset_version_id}/tilejson.json",
        bounds=version.bbox if version else None,
    )
