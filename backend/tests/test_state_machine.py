import pytest

from platform_backend.domain_enums import DatasetStatus, WorkflowRunStatus
from platform_backend.services.state_machine import (
    ensure_dataset_transition,
    ensure_workflow_run_transition,
)


def test_dataset_transition_rejects_invalid_step() -> None:
    with pytest.raises(ValueError):
        ensure_dataset_transition(DatasetStatus.READY, DatasetStatus.PROCESSING)


def test_workflow_run_transition_accepts_success_path() -> None:
    ensure_workflow_run_transition(WorkflowRunStatus.RUNNING, WorkflowRunStatus.SUCCEEDED)
