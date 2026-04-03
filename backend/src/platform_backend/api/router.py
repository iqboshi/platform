from fastapi import APIRouter

from platform_backend.api.routes import (
    auth,
    dataset_versions,
    datasets,
    jobs,
    models,
    splits,
    workflow_runs,
    workflows,
    workspaces,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["datasets"])
api_router.include_router(
    dataset_versions.router,
    prefix="/dataset-versions",
    tags=["dataset-versions"],
)
api_router.include_router(splits.router, prefix="/splits", tags=["splits"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
api_router.include_router(
    workflow_runs.router,
    prefix="/workflow-runs",
    tags=["workflow-runs"],
)
api_router.include_router(models.router, prefix="/models", tags=["models"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
