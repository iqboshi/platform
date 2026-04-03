from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import ModelSummary, ModelVersionSummary
from platform_backend.services.platform_store import list_model_versions, list_models

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[ModelSummary],
    dependencies=[Depends(require_permission("model.view"))],
)
def list_models_route(db: DatabaseDep) -> list[ModelSummary]:
    return list_models(db)


@router.get(
    "/versions",
    response_model=list[ModelVersionSummary],
    dependencies=[Depends(require_permission("model.view"))],
)
def list_model_versions_route(db: DatabaseDep) -> list[ModelVersionSummary]:
    return list_model_versions(db)
