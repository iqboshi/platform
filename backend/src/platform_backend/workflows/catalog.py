from __future__ import annotations

from platform_backend.schemas.workflow import WorkflowCatalogItem

BUILTIN_NODE_CATALOG: list[WorkflowCatalogItem] = [
    WorkflowCatalogItem(
        type="source.dataset",
        label="Dataset Source",
        category="source",
        description="Bind a dataset version as the workflow input.",
    ),
    WorkflowCatalogItem(
        type="preprocess.cog",
        label="Raster Preprocess",
        category="preprocess",
        description="Run projection, normalization, or COG preparation before downstream jobs.",
    ),
    WorkflowCatalogItem(
        type="split.grid",
        label="Tile Split",
        category="split",
        description="Create tiled derivatives or train/val/test splits.",
    ),
    WorkflowCatalogItem(
        type="inference.segmentation",
        label="Model Inference",
        category="inference",
        description="Apply a registered segmentation or detection model.",
    ),
    WorkflowCatalogItem(
        type="postprocess.export",
        label="Export Artifact",
        category="postprocess",
        description="Package the result dataset or vector artifact for download.",
    ),
]


def supported_node_types() -> set[str]:
    return {item.type for item in BUILTIN_NODE_CATALOG}
