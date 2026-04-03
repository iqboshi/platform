from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from platform_backend.domain_enums import WorkflowRunStatus


class WorkflowNodePort(BaseModel):
    key: str
    label: str


class WorkflowNode(BaseModel):
    id: str
    type: str
    position: dict[Literal["x", "y"], float]
    params: dict[str, Any] = Field(default_factory=dict)
    input_bindings: dict[str, str] = Field(default_factory=dict)
    output_defs: list[WorkflowNodePort] = Field(default_factory=list)


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class WorkflowGraph(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


class WorkflowCatalogItem(BaseModel):
    type: str
    label: str
    category: Literal["source", "preprocess", "split", "inference", "postprocess"]
    description: str


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
    model_version_id: str
    input_dataset_version_id: str
    priority: int = 5


class WorkflowRunAccepted(BaseModel):
    id: str
    workflow_version_id: str
    status: WorkflowRunStatus = WorkflowRunStatus.QUEUED
    submitted_by: str
