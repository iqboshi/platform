# platform-backend

FastAPI backend scaffold for dataset ingestion, workflow orchestration, model
registry, and tile-preview boundaries.

## Entry Points

- `platform_backend.main:app` - API server
- `platform_backend.tiler.app:app` - standalone tile-preview service
- `platform_backend.workers.celery_app:celery_app` - worker application

## Install

```powershell
python -m pip install -e .\backend[dev]
```
