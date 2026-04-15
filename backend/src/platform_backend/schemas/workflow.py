from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field

from platform_backend.domain_enums import WorkflowRunStatus

WorkflowNodeCategory = Literal[
    "source",
    "preprocess",
    "split",
    "inference",
    "postprocess",
    "control",
]
WorkflowRuntimeKind = Literal["source", "transform", "inference", "export"]
WorkflowPortDataType = Literal[
    "dataset_version",
    "table",
    "raster",
    "vector",
    "roi",
    "geo_raster",
    "image_collection",
    "feature_collection",
    "mask_raster",
    "mask_collection",
    "scene_collection",
    "scene",
    "tile_set",
    "label_set",
    "annotation_set",
    "prediction_set",
    "sample_set",
    "value",
    "value_list",
    "model_version",
    "model_ref",
    "metrics_report",
    "prediction_mask",
    "prediction_vector",
    "artifact",
]
WorkflowSemanticTaskType = str
WorkflowAnnotationKind = str
WorkflowSampleKind = str
WorkflowValueType = str
WorkflowStarterInputKind = Literal[
    "dataset_version",
    "spatial_roi",
    "model_version",
    "gee_credential",
]
WorkflowPreviewKind = Literal[
    "dataset_version",
    "model_ref",
    "model_version",
    "gee_credential",
    "table",
    "metrics_report",
    "artifact_file",
    "value",
]
WorkflowParamFieldType = Literal[
    "text",
    "number",
    "boolean",
    "select",
    "multiselect",
    "datasetVersion",
    "modelVersion",
    "spatialRoi",
    "geeCredential",
]
WorkflowIssueSeverity = Literal["error", "warning"]


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


class WorkflowPortContract(BaseModel):
    port_key: str = Field(
        validation_alias=AliasChoices("port_key", "portKey"),
    )
    summary: str
    dataset_kinds: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("dataset_kinds", "datasetKinds"),
    )
    file_formats: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("file_formats", "fileFormats"),
    )
    column_requirements: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("column_requirements", "columnRequirements"),
    )
    sample_columns: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("sample_columns", "sampleColumns"),
    )
    produced_columns: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("produced_columns", "producedColumns"),
    )
    task_types: list[WorkflowSemanticTaskType] = Field(
        default_factory=list,
        validation_alias=AliasChoices("task_types", "taskTypes"),
    )
    annotation_kinds: list[WorkflowAnnotationKind] = Field(
        default_factory=list,
        validation_alias=AliasChoices("annotation_kinds", "annotationKinds"),
    )
    sample_kinds: list[WorkflowSampleKind] = Field(
        default_factory=list,
        validation_alias=AliasChoices("sample_kinds", "sampleKinds"),
    )
    value_types: list[WorkflowValueType] = Field(
        default_factory=list,
        validation_alias=AliasChoices("value_types", "valueTypes"),
    )
    notes: list[str] = Field(default_factory=list)


WorkflowExampleKind = Literal["table", "json", "text"]


class WorkflowNodeExample(BaseModel):
    title: str
    kind: WorkflowExampleKind
    port_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("port_key", "portKey"),
    )
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    content: str | None = None


class WorkflowNodeStarterBinding(BaseModel):
    input_kind: WorkflowStarterInputKind = Field(
        validation_alias=AliasChoices("input_kind", "inputKind"),
    )
    param_key: str = Field(
        validation_alias=AliasChoices("param_key", "paramKey"),
    )
    preset_params: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("preset_params", "presetParams"),
    )
    auto_create: bool = Field(
        default=False,
        validation_alias=AliasChoices("auto_create", "autoCreate"),
    )
    priority: int = 0


class WorkflowNodeOutputUsage(BaseModel):
    target: Literal["workflow", "spatial"]
    input_kind: Literal[
        "dataset_version",
        "spatial_roi",
        "model_version",
        "gee_credential",
        "asset_version",
    ] = Field(validation_alias=AliasChoices("input_kind", "inputKind"))
    label: str | None = None


class WorkflowNodeOutputBehavior(BaseModel):
    port_key: str = Field(
        validation_alias=AliasChoices("port_key", "portKey"),
    )
    preview_kinds: list[WorkflowPreviewKind] = Field(
        default_factory=list,
        validation_alias=AliasChoices("preview_kinds", "previewKinds"),
    )
    usages: list[WorkflowNodeOutputUsage] = Field(default_factory=list)


class WorkflowNode(BaseModel):
    id: str
    type: str
    position: dict[Literal["x", "y"], float]
    params: dict[str, Any] = Field(default_factory=dict)
    input_bindings: dict[str, str] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("input_bindings", "inputBindings"),
    )
    input_defs: list[WorkflowNodePort] = Field(
        default_factory=list,
        validation_alias=AliasChoices("input_defs", "inputDefs"),
    )
    input_contracts: list[WorkflowPortContract] = Field(
        default_factory=list,
        validation_alias=AliasChoices("input_contracts", "inputContracts"),
    )
    output_defs: list[WorkflowNodePort] = Field(
        default_factory=list,
        validation_alias=AliasChoices("output_defs", "outputDefs"),
    )
    output_contracts: list[WorkflowPortContract] = Field(
        default_factory=list,
        validation_alias=AliasChoices("output_contracts", "outputContracts"),
    )
    subgraph: WorkflowGraph | None = None


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


WorkflowNode.model_rebuild()


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
    input_contracts: list[WorkflowPortContract] = Field(default_factory=list)
    output_contracts: list[WorkflowPortContract] = Field(default_factory=list)
    example_inputs: list[WorkflowNodeExample] = Field(default_factory=list)
    example_outputs: list[WorkflowNodeExample] = Field(default_factory=list)
    common_errors: list[str] = Field(default_factory=list)
    starter_bindings: list[WorkflowNodeStarterBinding] = Field(default_factory=list)
    output_behaviors: list[WorkflowNodeOutputBehavior] = Field(default_factory=list)


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
    visibility: str = "private"
    owner_user_id: str | None = None
    owner_display_name: str | None = None
    created_at: datetime


class WorkflowVersionUpdateRequest(BaseModel):
    visibility: str | None = None


class WorkflowValidationIssue(BaseModel):
    code: str
    severity: WorkflowIssueSeverity = "error"
    message: str
    node_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("node_id", "nodeId"),
    )
    port_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("port_key", "portKey"),
    )
    param_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("param_key", "paramKey"),
    )
    expected: str | None = None
    actual: str | None = None
    suggestion: str | None = None


class WorkflowValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    issues: list[WorkflowValidationIssue] = Field(default_factory=list)


class WorkflowRunRequest(BaseModel):
    workflow_version_id: str
    workspace_id: str
    priority: int = 5


class WorkflowRunAccepted(BaseModel):
    id: str
    workflow_version_id: str
    status: WorkflowRunStatus = WorkflowRunStatus.QUEUED
    submitted_by: str
    error_message: str | None = None


WorkflowNodeTestStatus = Literal["succeeded", "failed", "not_supported"]


class WorkflowNodeTestRequest(BaseModel):
    graph: WorkflowGraph
    node_id: str = Field(validation_alias=AliasChoices("node_id", "nodeId"))


class WorkflowNodeTestResponse(BaseModel):
    status: WorkflowNodeTestStatus
    node_id: str
    duration_ms: int = 0
    input_preview: dict[str, Any] = Field(default_factory=dict)
    output_preview: dict[str, Any] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
