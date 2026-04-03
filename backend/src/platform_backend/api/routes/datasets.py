from fastapi import APIRouter, HTTPException

from platform_backend.schemas.platform import (
    DatasetSummary,
    DatasetUploadConfirmRequest,
    DatasetUploadRequest,
    DatasetVersionSummary,
    UploadSessionResponse,
)
from platform_backend.services.demo_data import build_upload_session, confirm_upload, datasets

router = APIRouter()


@router.get("", response_model=list[DatasetSummary])
def list_datasets() -> list[DatasetSummary]:
    return datasets()


@router.get("/{dataset_id}", response_model=DatasetSummary)
def get_dataset(dataset_id: str) -> DatasetSummary:
    dataset = next((item for item in datasets() if item.id == dataset_id), None)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return dataset


@router.post("/upload-session", response_model=UploadSessionResponse)
def create_upload_session(request: DatasetUploadRequest) -> UploadSessionResponse:
    return build_upload_session(request)


@router.post("/confirm", response_model=DatasetVersionSummary)
def confirm_dataset_upload(request: DatasetUploadConfirmRequest) -> DatasetVersionSummary:
    return confirm_upload(request)
