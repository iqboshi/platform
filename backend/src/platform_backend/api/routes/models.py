from fastapi import APIRouter

from platform_backend.schemas.platform import ModelSummary, ModelVersionSummary
from platform_backend.services.demo_data import model_summaries, model_versions

router = APIRouter()


@router.get("", response_model=list[ModelSummary])
def list_models() -> list[ModelSummary]:
    return model_summaries()


@router.get("/versions", response_model=list[ModelVersionSummary])
def list_model_versions() -> list[ModelVersionSummary]:
    return model_versions()
