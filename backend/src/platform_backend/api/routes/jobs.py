from fastapi import APIRouter

from platform_backend.schemas.platform import JobSummary
from platform_backend.services.demo_data import jobs

router = APIRouter()


@router.get("", response_model=list[JobSummary])
def list_jobs() -> list[JobSummary]:
    return jobs()
