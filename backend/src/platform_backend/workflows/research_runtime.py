"""Deterministic, image-derived demo indices. No trained-model accuracy claims."""

from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rasterio.warp import reproject
from scipy.ndimage import uniform_filter

from platform_backend.workflows.research_catalog import METHODS


def png_url(rgb, valid):
    pixels = np.clip(rgb, 0, 255).astype("uint8")
    rgba = np.concatenate([pixels, (valid.astype("uint8") * 255)[None]], axis=0)
    with MemoryFile() as memory:
        with memory.open(
            driver="PNG", width=rgba.shape[2], height=rgba.shape[1], count=4, dtype="uint8"
        ) as image:
            image.write(rgba)
        return "data:image/png;base64," + base64.b64encode(memory.read()).decode("ascii")


def colorize(values):
    # Common fixed 0..1 legend across stages; no per-stage normalization.
    stops = np.array([[166, 67, 49], [241, 195, 93], [124, 180, 92], [25, 105, 83]])
    scaled = np.clip(values, 0, 1) * 3
    lo = np.minimum(scaled.astype(int), 2)
    frac = scaled - lo
    return np.moveaxis(stops[lo] * (1 - frac[..., None]) + stops[lo + 1] * frac[..., None], -1, 0)


def analyze(paths, method, params, output_root, roi=None):
    if method not in METHODS:
        raise ValueError("Unknown research method.")
    threshold = float(params.get("vegetationThreshold", 0.25))
    weight = float(params.get("structureWeight", 0.55))
    size = int(params.get("analysisSize", 512))
    if not 0 <= threshold <= 0.9 or not 0 <= weight <= 1 or size not in (512, 1024):
        raise ValueError("Invalid research demo parameters.")
    output_root = Path(output_root)
    output_root.mkdir(parents=True, exist_ok=True)
    frames = []
    reference = None
    for path in paths:
        with rasterio.open(path) as ds:
            if ds.count != 8 or ds.tags().get("research_demo_schema") != "wheat-eight-band-v1":
                raise ValueError(
                    "Select a prepared research stage dataset (RGB + five spectral bands)."
                )
            if reference is None:
                bounds = ds.bounds
                if roi is not None:
                    from rasterio.warp import transform_bounds

                    rb = transform_bounds("EPSG:4326", ds.crs, *roi)
                    bounds = (
                        max(bounds.left, rb[0]),
                        max(bounds.bottom, rb[1]),
                        min(bounds.right, rb[2]),
                        min(bounds.top, rb[3]),
                    )
                if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
                    raise ValueError("ROI does not intersect the image.")
                pixel_w = (bounds[2] - bounds[0]) / abs(ds.res[0])
                pixel_h = (bounds[3] - bounds[1]) / abs(ds.res[1])
                w = max(1, round(size * pixel_w / max(pixel_w, pixel_h)))
                h = max(1, round(size * pixel_h / max(pixel_w, pixel_h)))
                transform = rasterio.transform.from_bounds(*bounds, w, h)
                reference = (ds.crs, transform, w, h)
            crs, transform, w, h = reference
            data = np.full((8, h, w), np.nan, dtype="float32")
            for b in range(8):
                reproject(
                    rasterio.band(ds, b + 1),
                    data[b],
                    src_transform=ds.transform,
                    src_crs=ds.crs,
                    dst_transform=transform,
                    dst_crs=crs,
                    src_nodata=ds.nodata,
                    dst_nodata=np.nan,
                    resampling=Resampling.bilinear,
                )
            frames.append((ds.tags().get("capture_date", "日期未知"), data))
    # Restrict temporal analysis to pixels valid at every connected stage.
    valid = np.logical_and.reduce([np.isfinite(a).all(axis=0) for _, a in frames])
    if not valid.any():
        raise ValueError("The selected stages have no common valid pixels.")
    rows, images = [], []
    maps = []
    for date, data in frames:
        clean = np.nan_to_num(data, nan=0)
        rgb = clean[:3]
        blue, green, red, edge, nir = clean[3:]
        ndvi = np.clip((nir - red) / np.maximum(nir + red, 1e-6), -1, 1)
        ndre = np.clip((nir - edge) / np.maximum(nir + edge, 1e-6), -1, 1)
        vegetation = (ndvi > threshold) & valid
        grey = rgb.mean(axis=0) / 255
        local = uniform_filter(valid.astype(float), size=7)
        mean = uniform_filter(grey * valid, size=7) / np.maximum(local, 1e-6)
        variance = uniform_filter(grey**2 * valid, size=7) / np.maximum(local, 1e-6) - mean**2
        texture = np.clip(np.sqrt(np.maximum(variance, 0)) * 8, 0, 1)
        cover = uniform_filter(vegetation.astype(float), size=7) / np.maximum(local, 1e-6)
        spectral = np.clip(0.7 * ndvi + 0.3 * ndre, 0, 1)
        if method == "research.structure_tiller":
            result = np.clip(weight * cover + (1 - weight) * texture, 0, 1)
            middle, middle_label = cover, "局部植被覆盖"
        elif method == "research.spectral_transfer":
            # Fixed reference transform is an illustrative fusion, not fitted TCA/PROSAIL.
            reference_spectrum = np.clip(0.8 * ndvi + 0.2 * cover, 0, 1)
            result = weight * spectral + (1 - weight) * reference_spectrum
            middle, middle_label = spectral, "光谱特征指数"
        else:
            result = np.clip(0.75 * np.maximum(ndvi, 0) + 0.25 * cover, 0, 1)
            middle, middle_label = spectral, "植被活性指数"
        result = np.where(valid, result, np.nan)
        maps.append(result)
        values = result[valid]
        rows.append(
            {
                "date": date,
                "mean": round(float(values.mean()), 4),
                "vegetationCoverage": round(float(vegetation.sum() / valid.sum()), 4),
                "ndvi": round(float(ndvi[valid].mean()), 4),
                "ndre": round(float(ndre[valid].mean()), 4),
                "low": round(float((values < 0.33).mean()), 4),
                "medium": round(float(((values >= 0.33) & (values < 0.66)).mean()), 4),
                "high": round(float((values >= 0.66).mean()), 4),
                "spectrum": [
                    round(float(x[valid].mean()), 5) for x in (blue, green, red, edge, nir)
                ],
            }
        )
        images.append(
            {
                "date": date,
                "rgb": png_url(rgb, valid),
                "feature": png_url(colorize(middle), valid),
                "featureLabel": middle_label,
                "result": png_url(colorize(np.nan_to_num(result)), valid),
                "sampleGrid": [
                    [
                        round(float(result[y, x]), 4) if valid[y, x] else None
                        for x in np.linspace(0, w - 1, 32).astype(int)
                    ]
                    for y in np.linspace(0, h - 1, 32).astype(int)
                ],
            }
        )
    # Multi-date output retains one band per stage and one shared spatial grid.
    target = output_root / "research-result.tif"
    with rasterio.open(
        target,
        "w",
        driver="GTiff",
        width=w,
        height=h,
        count=len(maps),
        dtype="float32",
        crs=crs,
        transform=transform,
        nodata=np.nan,
        compress="deflate",
    ) as dst:
        dst.write(np.stack(maps).astype("float32"))
        dst.update_tags(method=method, units="relative_index_0_1", execution="simplified_demo")
        for i, (date, _) in enumerate(frames):
            dst.set_band_description(i + 1, date)
    unit = (
        "碳交换潜势指数（0–1）" if method == "research.carbon_potential" else "相对密度指数（0–1）"
    )
    report = {
        "researchDemo": True,
        "title": METHODS[method],
        "unit": unit,
        "execution": "真实影像计算 · 简化演示",
        "description": (
            "展示研究思路的简化计算；不属于论文模型复现，不输出实测密度、NEE通量或验证精度。"
        ),
        "method": method,
        "parameters": params,
        "rows": rows,
        "images": images,
        "bbox": list(rasterio.transform.array_bounds(h, w, transform)),
        "validPixels": int(valid.sum()),
        "grid": [w, h],
        "legend": ["低 · 0–0.33", "中 · 0.33–0.66", "高 · 0.66–1"],
        "steps": (
            ["植被提取", "覆盖与纹理分析", "结构特征融合"]
            if method.endswith("structure_tiller")
            else ["光谱指数提取", "参考特征构建", "加权融合"]
            if method.endswith("spectral_transfer")
            else ["共同区域对齐", "植被活性提取", "阶段潜势比较"]
        ),
    }
    (output_root / "report.json").write_text(
        json.dumps(report, ensure_ascii=False), encoding="utf-8"
    )
    return str(target), {
        "kind": "value",
        "summary": METHODS[method] + " · " + unit,
        "value": report,
    }
