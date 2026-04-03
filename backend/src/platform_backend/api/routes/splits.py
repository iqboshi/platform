from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import SplitJobRequest, SplitJobSummary
from platform_backend.services.platform_store import create_split, list_splits

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[SplitJobSummary],
    dependencies=[Depends(require_permission("dataset.view"))],
)
def list_split_jobs(db: DatabaseDep) -> list[SplitJobSummary]:
    return list_splits(db)


@router.post(
    "",
    response_model=SplitJobSummary,
    dependencies=[Depends(require_permission("dataset.manage"))],
)
def create_split_route(request: SplitJobRequest, db: DatabaseDep) -> SplitJobSummary:
    try:
        return create_split(db, request)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
