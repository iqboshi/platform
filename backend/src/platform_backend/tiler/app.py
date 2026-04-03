from __future__ import annotations

from fastapi import FastAPI

from platform_backend.tiler.routes import router as tiles_router

app = FastAPI(title="Platform Tile Service", version="0.1.0")
app.include_router(tiles_router, prefix="/tiles")
