from __future__ import annotations

from platform_backend.domain_enums import DatasetStatus, WorkflowRunStatus

DATASET_TRANSITIONS: dict[DatasetStatus, set[DatasetStatus]] = {
    DatasetStatus.UPLOADED: {DatasetStatus.PROCESSING, DatasetStatus.FAILED},
    DatasetStatus.PROCESSING: {DatasetStatus.READY, DatasetStatus.FAILED},
    DatasetStatus.READY: set(),
    DatasetStatus.FAILED: {DatasetStatus.PROCESSING},
}

WORKFLOW_RUN_TRANSITIONS: dict[WorkflowRunStatus, set[WorkflowRunStatus]] = {
    WorkflowRunStatus.DRAFT: {WorkflowRunStatus.QUEUED},
    WorkflowRunStatus.QUEUED: {WorkflowRunStatus.RUNNING, WorkflowRunStatus.FAILED},
    WorkflowRunStatus.RUNNING: {WorkflowRunStatus.SUCCEEDED, WorkflowRunStatus.FAILED},
    WorkflowRunStatus.SUCCEEDED: set(),
    WorkflowRunStatus.FAILED: {WorkflowRunStatus.QUEUED},
}


def ensure_dataset_transition(current: DatasetStatus, new: DatasetStatus) -> None:
    if new not in DATASET_TRANSITIONS[current]:
        raise ValueError(f"Invalid dataset transition: {current} -> {new}")


def ensure_workflow_run_transition(current: WorkflowRunStatus, new: WorkflowRunStatus) -> None:
    if new not in WORKFLOW_RUN_TRANSITIONS[current]:
        raise ValueError(f"Invalid workflow run transition: {current} -> {new}")
