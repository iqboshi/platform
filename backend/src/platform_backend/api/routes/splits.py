from fastapi import APIRouter

from platform_backend.schemas.platform import SplitJobRequest, SplitJobSummary
from platform_backend.services.demo_data import queue_split_job, split_jobs

router = APIRouter()


@router.get("", response_model=list[SplitJobSummary])
def list_split_jobs() -> list[SplitJobSummary]:
    return split_jobs()


@router.post("", response_model=SplitJobSummary)
def create_split(request: SplitJobRequest) -> SplitJobSummary:
    return queue_split_job(request)
