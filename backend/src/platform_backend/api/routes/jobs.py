from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import JobSummary
from platform_backend.services.platform_store import list_jobs

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[JobSummary],
    dependencies=[Depends(require_permission("job.view"))],
)
def list_jobs_route(db: DatabaseDep) -> list[JobSummary]:
    return list_jobs(db)
