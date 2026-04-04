from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field

from platform_backend.domain_enums import WorkflowRunStatus

WorkflowNodeCategory = Literal["source", "preprocess", "split", "inference", "postprocess"]
WorkflowRuntimeKind = Literal["source", "transform", "inference", "export"]
WorkflowPortDataType = Literal[
    "dataset_version",
    "table",
    "raster",
    "vector",
    "roi",
    "tile_set",
    "label_set",
    "model_ref",
    "metrics_report",
    "prediction_mask",
    "prediction_vector",
    "artifact",
]
WorkflowParamFieldType = Literal[
    "text",
    "number",
    "boolean",
    "select",
    "multiselect",
    "datasetVersion",
    "modelVersion",
]


class WorkflowNodePort(BaseModel):
    key: str
    label: str
    description: str | None = None
    data_types: list[WorkflowPortDataType] = Field(
        default_factory=list,
        validation_alias=AliasChoices("data_types", "dataTypes"),
    )
    required: bool = False


class WorkflowParamOption(BaseModel):
    label: str
    value: str


class WorkflowParamDefinition(BaseModel):
    key: str
    label: str
    field_type: WorkflowParamFieldType
    description: str | None = None
    default_value: Any | None = None
    placeholder: str | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[WorkflowParamOption] = Field(default_factory=list)
    required: bool = False


class WorkflowNode(BaseModel):
    id: str
    type: str
    position: dict[Literal["x", "y"], float]
    params: dict[str, Any] = Field(default_factory=dict)
    input_bindings: dict[str, str] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("input_bindings", "inputBindings"),
    )
    output_defs: list[WorkflowNodePort] = Field(
        default_factory=list,
        validation_alias=AliasChoices("output_defs", "outputDefs"),
    )


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = Field(
        default=None,
        validation_alias=AliasChoices("source_handle", "sourceHandle"),
    )
    target_handle: str | None = Field(
        default=None,
        validation_alias=AliasChoices("target_handle", "targetHandle"),
    )


class WorkflowGraph(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


class WorkflowCatalogItem(BaseModel):
    type: str
    label: str
    category: WorkflowNodeCategory
    description: str
    runtime_kind: WorkflowRuntimeKind = "transform"
    supported_tasks: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    inputs: list[WorkflowNodePort] = Field(default_factory=list)
    outputs: list[WorkflowNodePort] = Field(default_factory=list)
    params: list[WorkflowParamDefinition] = Field(default_factory=list)


class WorkflowTemplateSampleBinding(BaseModel):
    node_id: str
    params: dict[str, Any] = Field(default_factory=dict)


class WorkflowTemplateDefinition(BaseModel):
    id: str
    label: str
    description: str
    tags: list[str] = Field(default_factory=list)
    supported_tasks: list[str] = Field(default_factory=list)
    graph: WorkflowGraph
    sample_bindings: list[WorkflowTemplateSampleBinding] = Field(default_factory=list)


class WorkflowSummary(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str


class WorkflowVersionSummary(BaseModel):
    id: str
    workflow_id: str
    version: int
    graph: WorkflowGraph
    created_at: datetime


class WorkflowValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class WorkflowRunRequest(BaseModel):
    workflow_version_id: str
    workspace_id: str
    priority: int = 5


class WorkflowRunAccepted(BaseModel):
    id: str
    workflow_version_id: str
    status: WorkflowRunStatus = WorkflowRunStatus.QUEUED
    submitted_by: str
