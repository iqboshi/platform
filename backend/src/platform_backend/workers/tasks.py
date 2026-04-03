from __future__ import annotations

from celery import shared_task


@shared_task(name="platform.dataset.ingest")
def ingest_dataset(dataset_version_id: str) -> dict[str, str]:
    return {"dataset_version_id": dataset_version_id, "status": "queued"}


@shared_task(name="platform.dataset.split")
def create_split_job(split_job_id: str) -> dict[str, str]:
    return {"split_job_id": split_job_id, "status": "queued"}


@shared_task(name="platform.workflow.run")
def run_workflow(workflow_run_id: str) -> dict[str, str]:
    return {"workflow_run_id": workflow_run_id, "status": "queued"}
