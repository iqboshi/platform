from fastapi import APIRouter, HTTPException

from platform_backend.schemas.platform import DatasetVersionSummary
from platform_backend.services.demo_data import dataset_versions

router = APIRouter()


@router.get("", response_model=list[DatasetVersionSummary])
def list_dataset_versions(dataset_id: str | None = None) -> list[DatasetVersionSummary]:
    versions = dataset_versions()
    if dataset_id is None:
        return versions
    return [item for item in versions if item.dataset_id == dataset_id]


@router.get("/{dataset_version_id}", response_model=DatasetVersionSummary)
def get_dataset_version(dataset_version_id: str) -> DatasetVersionSummary:
    version = next((item for item in dataset_versions() if item.id == dataset_version_id), None)
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version not found.")
    return version
