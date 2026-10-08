"""Prepare lightweight stage rasters and register them without touching source images.

Run from repository root: .venv/Scripts/python scripts/prepare_research_demo.py
"""

from pathlib import Path
import json
import sqlite3
import argparse
from datetime import datetime

import numpy as np
import rasterio
from rasterio.enums import Resampling
from sqlalchemy import select

from platform_backend.core.settings import get_settings
from platform_backend.db.session import get_session_factory
from platform_backend.models.entities import Dataset, DatasetVersion, Workspace, User
from platform_backend.domain_enums import DatasetKind, DatasetStatus, RoleKey
from platform_backend.workflows.research_catalog import STAGE_DATES


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=r"D:\data\full_stage_tiller_tifs")
    parser.add_argument("--max-size", type=int, default=1536)
    args = parser.parse_args()
    source = Path(args.source)
    root = Path(get_settings().storage_root).resolve() / "research-demo"
    root.mkdir(parents=True, exist_ok=True)
    prepared = []
    for i, date in enumerate(STAGE_DATES, 1):
        target = root / f"stage-{i}.tif"
        if not target.exists():
            folder = source / f"stage_{i}"
            with rasterio.open(folder / "result.tif") as rgb:
                size = args.max_size
                w = round(rgb.width * size / max(rgb.width, rgb.height))
                h = round(rgb.height * size / max(rgb.width, rgb.height))
                transform = rgb.transform * rgb.transform.scale(
                    rgb.width / w, rgb.height / h
                )
                colors = rgb.read(
                    [1, 2, 3], out_shape=(3, h, w), resampling=Resampling.average
                ).astype("float32")
                mask = rgb.read(4, out_shape=(h, w), resampling=Resampling.nearest) > 0
                bands = []
                for name in ["Blue", "Green", "Red", "RedEdge", "NIR"]:
                    with rasterio.open(folder / f"result_{name}.tif") as ds:
                        if (ds.width, ds.height, ds.transform, ds.crs) != (
                            rgb.width,
                            rgb.height,
                            rgb.transform,
                            rgb.crs,
                        ):
                            raise ValueError(f"Stage {i} band grids differ.")
                        bands.append(
                            ds.read(1, out_shape=(h, w), resampling=Resampling.average)
                        )
                stack = np.concatenate([colors, np.stack(bands)], axis=0)
                stack[:, ~mask] = np.nan
                with rasterio.open(
                    target,
                    "w",
                    driver="GTiff",
                    width=w,
                    height=h,
                    count=8,
                    dtype="float32",
                    crs=rgb.crs,
                    transform=transform,
                    nodata=np.nan,
                    compress="deflate",
                    tiled=True,
                ) as dst:
                    dst.write(stack)
                    dst.update_tags(
                        research_demo_schema="wheat-eight-band-v1",
                        capture_date=date,
                        source_directory=str(folder.resolve()),
                        source_modified="false",
                    )
                    for b, name in enumerate(
                        [
                            "RGB_R",
                            "RGB_G",
                            "RGB_B",
                            "Blue",
                            "Green",
                            "Red",
                            "RedEdge",
                            "NIR",
                        ],
                        1,
                    ):
                        dst.set_band_description(b, name)
        prepared.append((i, date, target))
    # SQLite backup is consistent even if a local app is running; never overwrite older backup.
    database_url = get_settings().database_url
    if database_url.startswith("sqlite:///"):
        db_path = Path(database_url.removeprefix("sqlite:///"))
        if db_path.exists():
            backup = root / (
                "before-import-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".db"
            )
            with (
                sqlite3.connect(str(db_path)) as src,
                sqlite3.connect(str(backup)) as dest,
            ):
                src.backup(dest)
    with get_session_factory()() as db:
        workspace = db.scalar(select(Workspace).order_by(Workspace.created_at))
        owner = db.scalar(select(User).where(User.role_key == RoleKey.ADMIN))
        if workspace is None or owner is None:
            raise RuntimeError(
                "Start backend once to initialize workspace and admin before importing."
            )
        for i, date, path in prepared:
            version_id = f"research-stage-{i}-v1"
            existing = db.get(DatasetVersion, version_id)
            if existing:
                with rasterio.open(path) as ds:
                    existing.bbox = list(ds.bounds)
                continue
            with rasterio.open(path) as ds:
                bbox = list(ds.bounds)
                width = ds.width
                height = ds.height
            dataset = Dataset(
                id=f"research-stage-{i}",
                workspace_id=workspace.id,
                name=f"冬小麦 · {date} · RGB＋五波段",
                kind=DatasetKind.RASTER,
                status=DatasetStatus.READY,
                projection="EPSG:4326",
                description="真实无人机影像的轻量演示副本；原文件未修改。",
            )
            db.add(dataset)
            db.flush()
            db.add(
                DatasetVersion(
                    id=version_id,
                    dataset_id=dataset.id,
                    version=1,
                    status=DatasetStatus.READY,
                    asset_path=str(path),
                    original_file_name=path.name,
                    content_type="image/tiff",
                    size_bytes=path.stat().st_size,
                    bbox=bbox,
                    preview_url=f"/api/v1/dataset-versions/{version_id}/download",
                    metadata_json={
                        "visibility": "public",
                        "owner_user_id": owner.id,
                        "owner_display_name": owner.display_name,
                        "bbox": bbox,
                        "width": width,
                        "height": height,
                        "capture_date": date,
                        "research_demo": True,
                        "band_count": 8,
                        "content_type": "image/tiff",
                        "original_file_name": path.name,
                        "source_directory": str((source / f"stage_{i}").resolve()),
                    },
                )
            )
        db.commit()
    print(
        json.dumps(
            [
                {
                    "stage": i,
                    "date": date,
                    "path": str(p),
                    "mb": round(p.stat().st_size / 1024**2, 2),
                }
                for i, date, p in prepared
            ],
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
