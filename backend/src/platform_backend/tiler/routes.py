from __future__ import annotations

from fastapi import APIRouter

from platform_backend.db.session import get_session_factory
from platform_backend.services.platform_store import tile_preview

router = APIRouter()


@router.get("/datasets/{dataset_version_id}/tilejson.json")
def dataset_tilejson(dataset_version_id: str) -> dict[str, object]:
    with get_session_factory()() as session:
        preview = tile_preview(session, dataset_version_id)
    return {
        "tilejson": "3.0.0",
        "name": dataset_version_id,
        "tiles": [f"/tiles/datasets/{dataset_version_id}/{{z}}/{{x}}/{{y}}.png"],
        "bounds": preview.bounds,
        "minzoom": preview.minzoom,
        "maxzoom": preview.maxzoom,
    }


@router.get("/healthz")
def tiler_healthz() -> dict[str, str]:
    return {"status": "ok"}
