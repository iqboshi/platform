from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from platform_backend.api.router import api_router
from platform_backend.core.logging import configure_logging
from platform_backend.core.settings import get_settings
from platform_backend.services.bootstrap import init_platform
from platform_backend.tiler.routes import router as tiles_router


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Remote sensing data management and workflow orchestration platform.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def startup() -> None:
        init_platform()

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok", "env": settings.env}

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    app.include_router(tiles_router, prefix="/tiles", tags=["tiles"])
    return app


app = create_app()
