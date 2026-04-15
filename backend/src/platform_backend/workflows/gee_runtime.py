from __future__ import annotations

import json
import math
import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

from platform_backend.core.settings import get_settings
from platform_backend.domain_enums import DatasetKind
from platform_backend.models.entities import User, WorkflowVersion
from platform_backend.workflows.subgraph_runtime import (
    CALL_SUBGRAPH_NODE_TYPE,
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
)

SUPPORTED_GEE_NODE_TYPES = {
    "source.sentinel2_gee_download",
    CALL_SUBGRAPH_NODE_TYPE,
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
}
SENTINEL2_COLLECTION_ID = "COPERNICUS/S2_SR_HARMONIZED"
GEE_DOWNLOAD_SAFETY_FILL_RATIO = 0.8
GEE_DOWNLOAD_MAX_GRID_DIMENSION = 10_000
GEE_ESTIMATED_BYTES_PER_SAMPLE = 4
SUPPORTED_SENTINEL2_BANDS = {
    "AOT",
    "B1",
    "B01",
    "B2",
    "B02",
    "B3",
    "B03",
    "B4",
    "B04",
    "B5",
    "B05",
    "B6",
    "B06",
    "B7",
    "B07",
    "B8",
    "B08",
    "B9",
    "B09",
    "B11",
    "B12",
    "B8A",
    "SCL",
    "TCI_B",
    "TCI_G",
    "TCI_R",
    "WVP",
}

SENTINEL2_BAND_ALIASES = {
    "B01": "B1",
    "B02": "B2",
    "B03": "B3",
    "B04": "B4",
    "B05": "B5",
    "B06": "B6",
    "B07": "B7",
    "B08": "B8",
    "B09": "B9",
}


@dataclass(frozen=True)
class GeeCredentialConfig:
    source: str
    name: str
    service_account_json: str
    project_id: str | None = None


@dataclass(frozen=True)
class SentinelDownloadParams:
    bbox: tuple[float, float, float, float]
    start_date: date
    end_date: date
    max_cloud_cover: float
    bands: tuple[str, ...]
    scale: int
    output_dataset_name: str
    credential_mode: str
    personal_credential_id: str | None


@dataclass(frozen=True)
class SentinelDownloadPlan:
    requested_scale: int
    effective_scale: int
    requested_pixel_width: int
    requested_pixel_height: int
    requested_pixel_count: int
    requested_estimated_bytes: int
    download_pixel_width: int
    download_pixel_height: int
    download_pixel_count: int
    download_estimated_bytes: int
    scale_adjusted: bool


ResolveGeeCredentialFn = Callable[[str, str | None], GeeCredentialConfig]
CreatePrivateDatasetVersionFn = Callable[..., Any]


def supports_gee_node(node_type: str) -> bool:
    return node_type == "source.sentinel2_gee_download"


def is_supported_gee_graph(graph_json: dict[str, object]) -> bool:
    node_types = _collect_graph_node_types(graph_json)
    if not node_types:
        return False
    return bool(node_types) and node_types.issubset(SUPPORTED_GEE_NODE_TYPES)


def _collect_graph_node_types(graph_json: dict[str, object]) -> set[str]:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list):
        return set()

    node_types: set[str] = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type", "")).strip()
        if node_type:
            node_types.add(node_type)
        subgraph = node.get("subgraph")
        if isinstance(subgraph, dict):
            node_types.update(_collect_graph_node_types(subgraph))
    return node_types


def parse_bbox(value: object) -> tuple[float, float, float, float]:
    if isinstance(value, (list, tuple)) and len(value) == 4:
        parts = [float(item) for item in value]
    elif isinstance(value, str):
        tokens = [item for item in re.split(r"[\s,]+", value.strip()) if item]
        if len(tokens) != 4:
            raise ValueError("bbox must contain four comma-separated coordinates.")
        parts = [float(item) for item in tokens]
    else:
        raise ValueError("bbox is required and must be a string or four-value list.")

    min_x, min_y, max_x, max_y = parts
    if not (-180 <= min_x < max_x <= 180):
        raise ValueError("bbox longitude must satisfy -180 <= minX < maxX <= 180.")
    if not (-90 <= min_y < max_y <= 90):
        raise ValueError("bbox latitude must satisfy -90 <= minY < maxY <= 90.")
    return min_x, min_y, max_x, max_y


def _parse_iso_date(value: object, field_name: str) -> date:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required.")
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format.") from exc


def _parse_bands(value: object) -> tuple[str, ...]:
    if isinstance(value, list):
        bands = [str(item).strip().upper() for item in value if str(item).strip()]
    else:
        bands = [item.strip().upper() for item in str(value or "").split(",") if item.strip()]

    if not bands:
        return ("B4", "B3", "B2")

    invalid_bands = [item for item in bands if item not in SUPPORTED_SENTINEL2_BANDS]
    if invalid_bands:
        raise ValueError(f"Unsupported Sentinel-2 bands: {', '.join(invalid_bands)}")
    normalized_bands = [SENTINEL2_BAND_ALIASES.get(item, item) for item in bands]
    return tuple(dict.fromkeys(normalized_bands))


def parse_sentinel_download_params(params: dict[str, object]) -> SentinelDownloadParams:
    bbox = parse_bbox(params.get("bbox"))
    start_date = _parse_iso_date(params.get("startDate"), "startDate")
    end_date = _parse_iso_date(params.get("endDate"), "endDate")
    if end_date < start_date:
        raise ValueError("endDate must be on or after startDate.")

    max_cloud_cover = float(params.get("maxCloudCover", 20) or 20)
    if not 0 <= max_cloud_cover <= 100:
        raise ValueError("maxCloudCover must be between 0 and 100.")

    scale = int(float(params.get("scale", 10) or 10))
    if scale <= 0:
        raise ValueError("scale must be greater than 0.")

    credential_mode = str(params.get("credentialMode", "platform_default") or "platform_default")
    if credential_mode not in {"platform_default", "personal"}:
        raise ValueError("credentialMode must be platform_default or personal.")

    personal_credential_id = str(params.get("personalCredentialId", "")).strip() or None
    if credential_mode == "personal" and personal_credential_id is None:
        raise ValueError("personalCredentialId is required when credentialMode is personal.")

    output_dataset_name = str(params.get("outputDatasetName", "")).strip()
    return SentinelDownloadParams(
        bbox=bbox,
        start_date=start_date,
        end_date=end_date,
        max_cloud_cover=max_cloud_cover,
        bands=_parse_bands(params.get("bands", ["B4", "B3", "B2"])),
        scale=scale,
        output_dataset_name=output_dataset_name,
        credential_mode=credential_mode,
        personal_credential_id=personal_credential_id,
    )


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip())
    return normalized.strip("-").lower() or "sentinel2-scene"


def _load_earth_engine_module():
    try:
        import ee  # type: ignore[import-not-found]
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "earthengine-api is not installed. "
            "Install backend dependencies to use Sentinel download."
        ) from exc
    return ee


def _apply_proxy_environment() -> None:
    settings = get_settings()
    proxy_pairs = {
        "HTTP_PROXY": settings.http_proxy.strip(),
        "HTTPS_PROXY": settings.https_proxy.strip(),
        "ALL_PROXY": settings.all_proxy.strip(),
    }
    for key, value in proxy_pairs.items():
        if value:
            os.environ[key] = value
            os.environ[key.lower()] = value

    if not os.environ.get("NO_PROXY") and not os.environ.get("no_proxy"):
        os.environ["NO_PROXY"] = "127.0.0.1,localhost"
        os.environ["no_proxy"] = "127.0.0.1,localhost"


def _configured_proxy_url() -> str | None:
    settings = get_settings()
    for value in (
        settings.https_proxy,
        settings.http_proxy,
        settings.all_proxy,
        os.environ.get("HTTPS_PROXY"),
        os.environ.get("HTTP_PROXY"),
        os.environ.get("ALL_PROXY"),
        os.environ.get("https_proxy"),
        os.environ.get("http_proxy"),
        os.environ.get("all_proxy"),
    ):
        proxy = str(value or "").strip()
        if proxy:
            return proxy
    return None


def _requests_proxies() -> dict[str, str]:
    settings = get_settings()
    proxies: dict[str, str] = {}
    http_proxy = str(settings.http_proxy or os.environ.get("HTTP_PROXY") or "").strip()
    https_proxy = str(settings.https_proxy or os.environ.get("HTTPS_PROXY") or "").strip()
    all_proxy = str(settings.all_proxy or os.environ.get("ALL_PROXY") or "").strip()

    if http_proxy:
        proxies["http"] = http_proxy
    if https_proxy:
        proxies["https"] = https_proxy
    if all_proxy:
        proxies.setdefault("http", all_proxy)
        proxies.setdefault("https", all_proxy)
    return proxies


def _build_requests_session() -> requests.Session:
    _apply_proxy_environment()
    session = requests.Session()
    proxies = _requests_proxies()
    if proxies:
        session.proxies.update(proxies)
    return session


def _extract_host_from_error(message: str) -> str | None:
    patterns = [
        r"https?://([^/\s'\"()]+)",
        r"host='([^']+)'",
        r'host="([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, message)
        if match:
            return match.group(1)

    lowered = message.lower()
    if "/token" in lowered:
        return "oauth2.googleapis.com"
    if "$discovery/rest" in lowered:
        return "earthengine.googleapis.com"
    return None


def _exception_text(exc: Exception) -> str:
    parts: list[str] = []
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        text = str(current).strip()
        if text and text not in parts:
            parts.append(text)
        current = current.__cause__ or current.__context__
    return " | ".join(parts) or exc.__class__.__name__


def _normalize_gee_runtime_error(exc: Exception) -> str:
    settings = get_settings()
    raw_message = _exception_text(exc)
    lowered = raw_message.lower()
    host = _extract_host_from_error(raw_message)
    proxy = _configured_proxy_url()
    proxy_hint = f" Current proxy: {proxy}." if proxy else ""

    is_network_error = any(
        marker in lowered
        for marker in (
            "timed out",
            "timeout",
            "connecttimeout",
            "max retries exceeded",
            "failed to establish a new connection",
            "connection refused",
            "connection aborted",
            "proxyerror",
            "temporarily unavailable",
            "name or service not known",
        )
    )

    if host and is_network_error:
        return (
            f"Unable to connect to {host} within "
            f"{settings.gee_request_timeout_seconds} seconds. "
            f"Check your VPN or proxy settings and try again.{proxy_hint}"
        )

    if "proxy" in lowered:
        return f"The configured proxy could not reach the Google Earth Engine services.{proxy_hint}"

    return raw_message


def _initialize_earth_engine(ee_module, credential: GeeCredentialConfig) -> dict[str, Any]:
    settings = get_settings()
    try:
        credential_payload = json.loads(credential.service_account_json)
    except json.JSONDecodeError as exc:
        raise ValueError("The configured GEE credential is not valid JSON.") from exc

    service_account = str(credential_payload.get("client_email", "")).strip()
    if not service_account:
        raise ValueError("The configured GEE credential is missing client_email.")

    credentials = ee_module.ServiceAccountCredentials(
        service_account,
        key_data=credential.service_account_json,
    )
    session = _build_requests_session()
    http_transport = ee_module._cloud_api_utils._Http(
        session,
        timeout=float(settings.gee_request_timeout_seconds),
    )
    project_id = (
        credential.project_id or str(credential_payload.get("project_id", "")).strip() or None
    )

    try:
        if project_id:
            ee_module.Initialize(
                credentials,
                project=project_id,
                http_transport=http_transport,
            )
        else:
            ee_module.Initialize(
                credentials,
                http_transport=http_transport,
            )
        state = ee_module.data._get_state()
        state.requests_session = session
        ee_module.data.setMaxRetries(settings.gee_max_retries)
        ee_module.data.setDeadline(settings.gee_request_timeout_seconds * 1000)
    except Exception as exc:
        raise RuntimeError(_normalize_gee_runtime_error(exc)) from exc

    return {
        "service_account": service_account,
        "project_id": project_id,
    }


def _estimate_pixel_count(
    bbox: tuple[float, float, float, float],
    scale: int,
) -> int:
    pixel_width, pixel_height = _estimate_pixel_dimensions(bbox, scale)
    return pixel_width * pixel_height


def _estimate_pixel_dimensions(
    bbox: tuple[float, float, float, float],
    scale: int,
) -> tuple[int, int]:
    min_x, min_y, max_x, max_y = bbox
    mid_lat_radians = math.radians((min_y + max_y) / 2)
    width_m = 111_320 * math.cos(mid_lat_radians) * (max_x - min_x)
    height_m = 110_540 * (max_y - min_y)
    pixel_width = max(1, math.ceil(width_m / scale))
    pixel_height = max(1, math.ceil(height_m / scale))
    return pixel_width, pixel_height


def _estimate_request_bytes(pixel_count: int, band_count: int) -> int:
    return pixel_count * max(band_count, 1) * GEE_ESTIMATED_BYTES_PER_SAMPLE


def _round_scale_up(scale: float) -> int:
    rounded = max(1, math.ceil(scale))
    if rounded <= 10:
        return rounded
    return int(math.ceil(rounded / 5) * 5)


def _build_download_plan(params: SentinelDownloadParams) -> SentinelDownloadPlan:
    settings = get_settings()
    requested_pixel_width, requested_pixel_height = _estimate_pixel_dimensions(
        params.bbox,
        params.scale,
    )
    requested_pixel_count = requested_pixel_width * requested_pixel_height
    requested_estimated_bytes = _estimate_request_bytes(
        requested_pixel_count,
        len(params.bands),
    )

    size_ratio = requested_estimated_bytes / max(
        settings.gee_single_request_max_bytes * GEE_DOWNLOAD_SAFETY_FILL_RATIO, 1
    )
    width_ratio = requested_pixel_width / GEE_DOWNLOAD_MAX_GRID_DIMENSION
    height_ratio = requested_pixel_height / GEE_DOWNLOAD_MAX_GRID_DIMENSION
    scale_factor = max(1.0, math.sqrt(size_ratio), width_ratio, height_ratio)
    effective_scale = _round_scale_up(params.scale * scale_factor)

    download_pixel_width, download_pixel_height = _estimate_pixel_dimensions(
        params.bbox,
        effective_scale,
    )
    download_pixel_count = download_pixel_width * download_pixel_height
    download_estimated_bytes = _estimate_request_bytes(
        download_pixel_count,
        len(params.bands),
    )
    return SentinelDownloadPlan(
        requested_scale=params.scale,
        effective_scale=effective_scale,
        requested_pixel_width=requested_pixel_width,
        requested_pixel_height=requested_pixel_height,
        requested_pixel_count=requested_pixel_count,
        requested_estimated_bytes=requested_estimated_bytes,
        download_pixel_width=download_pixel_width,
        download_pixel_height=download_pixel_height,
        download_pixel_count=download_pixel_count,
        download_estimated_bytes=download_estimated_bytes,
        scale_adjusted=effective_scale != params.scale,
    )


def _parse_request_size_limit_error(message: str) -> tuple[int, int] | None:
    match = re.search(
        r"Total request size \((\d+) bytes\) must be (?:less than or equal to|<=) (\d+) bytes",
        message,
        re.IGNORECASE,
    )
    if match is None:
        return None
    return int(match.group(1)), int(match.group(2))


def _format_mebibytes(value: int) -> str:
    return f"{value / 1024 / 1024:.1f} MiB"


def _size_limit_error_message(
    *,
    requested_scale: int,
    attempted_scale: int,
    actual_bytes: int,
    limit_bytes: int,
) -> str:
    adjusted_copy = (
        f" The backend already auto-adjusted the scale from {requested_scale}m "
        f"to {attempted_scale}m."
        if attempted_scale != requested_scale
        else ""
    )
    return (
        "The selected bbox is too large for a single Google Earth Engine download."
        f"{adjusted_copy} "
        f"Earth Engine estimated {_format_mebibytes(actual_bytes)} for this request, "
        f"but the single-request limit is {_format_mebibytes(limit_bytes)}. "
        "Reduce the bbox or increase the scale."
    )


def _retry_scale_after_size_error(
    *,
    current_scale: int,
    actual_bytes: int,
    limit_bytes: int,
) -> int:
    safe_limit = max(limit_bytes * GEE_DOWNLOAD_SAFETY_FILL_RATIO, 1)
    required_ratio = max(actual_bytes / safe_limit, 1.05)
    return _round_scale_up(current_scale * math.sqrt(required_ratio))


def _format_acquired_at(value: object) -> str | None:
    if value is None:
        return None
    try:
        millis = int(value)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(millis / 1000, tz=UTC).isoformat()


def _rank_collection(collection, ee_module):
    max_epoch = 4_102_444_800_000

    def add_rank(image):
        cloud_cover = ee_module.Number(image.get("CLOUDY_PIXEL_PERCENTAGE"))
        acquired_at = ee_module.Number(image.get("system:time_start"))
        sort_key = cloud_cover.multiply(1_000_000_000_000_000).add(
            ee_module.Number(max_epoch).subtract(acquired_at)
        )
        return image.set("_platform_sort_key", sort_key)

    return collection.map(add_rank).sort("_platform_sort_key")


def _resolve_scene(
    params: SentinelDownloadParams,
    credential: GeeCredentialConfig,
) -> tuple[object, object, object, dict[str, Any]]:
    settings = get_settings()
    download_plan = _build_download_plan(params)
    if download_plan.requested_pixel_count > settings.gee_download_max_pixels:
        raise ValueError(
            "The requested bbox is too large for a single download. "
            "Reduce the bbox or increase scale."
        )
    requested_estimated_mb = round(download_plan.requested_estimated_bytes / 1024 / 1024, 2)
    download_estimated_mb = round(download_plan.download_estimated_bytes / 1024 / 1024, 2)
    if requested_estimated_mb > settings.gee_download_max_estimated_mb:
        raise ValueError(
            "The requested bbox is estimated to exceed the configured download size limit."
        )

    ee_module = _load_earth_engine_module()
    auth_metadata = _initialize_earth_engine(ee_module, credential)
    region = ee_module.Geometry.Rectangle(list(params.bbox), proj="EPSG:4326", geodesic=False)
    ranked_collection = _rank_collection(
        ee_module.ImageCollection(SENTINEL2_COLLECTION_ID)
        .filterBounds(region)
        .filterDate(
            params.start_date.isoformat(),
            (params.end_date + timedelta(days=1)).isoformat(),
        )
        .filter(ee_module.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", params.max_cloud_cover)),
        ee_module,
    )

    scene_count = int(ranked_collection.size().getInfo())
    if scene_count <= 0:
        raise RuntimeError(
            "No Sentinel-2 scene matched the selected bbox, date, and cloud filters."
        )

    selected_image = ee_module.Image(ranked_collection.first())
    selected_info = selected_image.getInfo() or {}
    properties = selected_info.get("properties", {})
    scene_id = str(
        selected_info.get("id")
        or properties.get("PRODUCT_ID")
        or properties.get("system:index")
        or "sentinel2-scene"
    )
    scene_metadata = {
        "provider": "google-earth-engine",
        "collection": SENTINEL2_COLLECTION_ID,
        "scene_id": scene_id,
        "product_id": str(properties.get("PRODUCT_ID", "")).strip() or None,
        "cloud_cover": float(properties.get("CLOUDY_PIXEL_PERCENTAGE", 0) or 0),
        "acquired_at": _format_acquired_at(properties.get("system:time_start")),
        "bands": list(params.bands),
        "scale": download_plan.effective_scale,
        "requested_scale": params.scale,
        "scale_adjusted": download_plan.scale_adjusted,
        "bbox": list(params.bbox),
        "estimated_pixels": download_plan.download_pixel_count,
        "estimated_size_mb": download_estimated_mb,
        "requested_estimated_size_mb": requested_estimated_mb,
        "estimated_request_bytes": download_plan.download_estimated_bytes,
        "requested_estimated_request_bytes": download_plan.requested_estimated_bytes,
        "request_size_limit_bytes": settings.gee_single_request_max_bytes,
        "request_size_limit_mb": round(settings.gee_single_request_max_bytes / 1024 / 1024, 2),
        "download_pixel_width": download_plan.download_pixel_width,
        "download_pixel_height": download_plan.download_pixel_height,
        "requested_pixel_width": download_plan.requested_pixel_width,
        "requested_pixel_height": download_plan.requested_pixel_height,
        "matching_scene_count": scene_count,
        "credential_source": credential.source,
        "credential_name": credential.name,
        "service_account_email": auth_metadata.get("service_account"),
        "project_id": auth_metadata.get("project_id"),
    }
    return ee_module, region, selected_image, scene_metadata


def _download_image(
    ee_module,
    image,
    region,
    params: SentinelDownloadParams,
    output_path: Path,
) -> dict[str, Any]:
    settings = get_settings()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    clipped = image.select(list(params.bands)).clip(region)
    region_geometry = region.getInfo()
    region_coordinates = (
        region_geometry.get("coordinates") if isinstance(region_geometry, dict) else None
    )
    attempt_scale = _build_download_plan(params).effective_scale

    for _attempt in range(3):
        try:
            download_url = clipped.getDownloadURL(
                {
                    "name": output_path.stem,
                    "scale": attempt_scale,
                    "region": region_coordinates,
                    "format": "GEO_TIFF",
                    "crs": "EPSG:4326",
                    "filePerBand": False,
                }
            )
            session = _build_requests_session()
            with session.get(
                download_url,
                stream=True,
                timeout=float(settings.gee_request_timeout_seconds),
            ) as response:
                response.raise_for_status()
                with output_path.open("wb") as file_obj:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            file_obj.write(chunk)
            download_pixel_width, download_pixel_height = _estimate_pixel_dimensions(
                params.bbox,
                attempt_scale,
            )
            download_pixel_count = download_pixel_width * download_pixel_height
            download_estimated_bytes = _estimate_request_bytes(
                download_pixel_count,
                len(params.bands),
            )
            return {
                "scale": attempt_scale,
                "requested_scale": params.scale,
                "scale_adjusted": attempt_scale != params.scale,
                "estimated_pixels": download_pixel_count,
                "estimated_size_mb": round(download_estimated_bytes / 1024 / 1024, 2),
                "estimated_request_bytes": download_estimated_bytes,
                "download_pixel_width": download_pixel_width,
                "download_pixel_height": download_pixel_height,
            }
        except Exception as exc:
            raw_message = _exception_text(exc)
            size_error = _parse_request_size_limit_error(raw_message)
            if size_error is not None:
                actual_bytes, limit_bytes = size_error
                next_scale = _retry_scale_after_size_error(
                    current_scale=attempt_scale,
                    actual_bytes=actual_bytes,
                    limit_bytes=limit_bytes,
                )
                if next_scale > attempt_scale:
                    attempt_scale = next_scale
                    continue
                raise RuntimeError(
                    _size_limit_error_message(
                        requested_scale=params.scale,
                        attempted_scale=attempt_scale,
                        actual_bytes=actual_bytes,
                        limit_bytes=limit_bytes,
                    )
                ) from exc
            raise RuntimeError(_normalize_gee_runtime_error(exc)) from exc

    raise RuntimeError(
        "Sentinel download exceeded the retry limit while adjusting the download scale."
    )


def preview_sentinel_scene(
    params: SentinelDownloadParams,
    credential: GeeCredentialConfig,
) -> dict[str, Any]:
    try:
        _, _, _, scene_metadata = _resolve_scene(params, credential)
        return scene_metadata
    except Exception as exc:
        raise RuntimeError(_normalize_gee_runtime_error(exc)) from exc


def download_sentinel_scene(
    params: SentinelDownloadParams,
    credential: GeeCredentialConfig,
    output_path: Path,
) -> dict[str, Any]:
    try:
        ee_module, region, image, scene_metadata = _resolve_scene(params, credential)
        download_metadata = _download_image(ee_module, image, region, params, output_path)
        scene_metadata.update(download_metadata)
        scene_metadata["download_path"] = str(output_path.resolve())
        scene_metadata["size_bytes"] = output_path.stat().st_size
        return scene_metadata
    except Exception as exc:
        raise RuntimeError(_normalize_gee_runtime_error(exc)) from exc


def _workflow_nodes(graph_json: dict[str, object]) -> list[dict[str, object]]:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list):
        raise ValueError("Workflow graph is invalid.")
    return [node for node in nodes if isinstance(node, dict)]


def _find_node(graph_json: dict[str, object], node_id: str) -> dict[str, object]:
    for node in _workflow_nodes(graph_json):
        if str(node.get("id", "")) == node_id:
            return node
    raise LookupError(f"Workflow node was not found: {node_id}")


def _subgraph_output_ports(graph_json: dict[str, object]) -> list[dict[str, object]]:
    ports: list[dict[str, object]] = []
    for node in sorted(
        [
            item
            for item in _workflow_nodes(graph_json)
            if str(item.get("type", "")).strip() == SUBGRAPH_OUTPUT_NODE_TYPE
        ],
        key=lambda item: (
            float(item.get("position", {}).get("y", 0.0)),
            float(item.get("position", {}).get("x", 0.0)),
            str(item.get("id", "")),
        ),
    ):
        raw_ports = node.get("input_defs", [])
        if not isinstance(raw_ports, list):
            continue
        ports.extend(port for port in raw_ports if isinstance(port, dict))
    return ports


def _first_sentinel_node(graph_json: dict[str, object]) -> dict[str, object] | None:
    for node in _workflow_nodes(graph_json):
        node_type = str(node.get("type", "")).strip()
        if node_type == "source.sentinel2_gee_download":
            return node
        if node_type == CALL_SUBGRAPH_NODE_TYPE:
            subgraph = node.get("subgraph")
            if isinstance(subgraph, dict):
                nested = _first_sentinel_node(subgraph)
                if nested is not None:
                    return nested
    return None


def test_gee_node(
    *,
    graph_json: dict[str, object],
    target_node_id: str,
    resolve_credential: ResolveGeeCredentialFn,
) -> dict[str, object]:
    node = _find_node(graph_json, target_node_id)
    node_type = str(node.get("type", "")).strip()
    preview_node = node
    preview_ports = [{"key": "dataset"}]
    if node_type == CALL_SUBGRAPH_NODE_TYPE:
        subgraph = node.get("subgraph")
        if not isinstance(subgraph, dict):
            raise ValueError(f"Node {target_node_id} is missing a valid subgraph definition.")
        sentinel_node = _first_sentinel_node(subgraph)
        if sentinel_node is None:
            raise NotImplementedError(
                "GEE subgraphs currently require a nested source.sentinel2_gee_download node."
            )
        preview_node = sentinel_node
        preview_ports = _subgraph_output_ports(subgraph) or preview_ports
    if str(preview_node.get("type", "")).strip() != "source.sentinel2_gee_download":
        raise NotImplementedError(f"GEE node testing is not supported for {node_type}.")

    params = parse_sentinel_download_params(
        preview_node.get("params", {}) if isinstance(preview_node.get("params", {}), dict) else {}
    )
    credential = resolve_credential(params.credential_mode, params.personal_credential_id)
    scene_metadata = preview_sentinel_scene(params, credential)
    dataset_name = params.output_dataset_name or f"Sentinel-2 {scene_metadata['scene_id']}"
    scale_summary = (
        f" | scale {scene_metadata['requested_scale']}m -> {scene_metadata['scale']}m"
        if scene_metadata.get("scale_adjusted")
        else ""
    )

    return {
        "node_id": target_node_id,
        "input_preview": {},
        "output_preview": {
            str(port.get("key", "dataset")): {
                "kind": "dataset_version",
                "dataset_name": dataset_name,
                "version": 1,
                "status": "ready",
                "summary": (
                    f"{scene_metadata['scene_id']} | cloud "
                    f"{scene_metadata['cloud_cover']:.2f}%{scale_summary}"
                ),
                **scene_metadata,
            }
            for port in preview_ports
            if str(port.get("key", "")).strip()
        },
    }


def execute_gee_graph(
    *,
    db,
    workflow_version: WorkflowVersion,
    graph_json: dict[str, object] | None,
    current_user: User,
    workspace_id: str,
    run_id: str,
    storage_root: Path,
    resolve_credential: ResolveGeeCredentialFn,
    create_private_dataset_version: CreatePrivateDatasetVersionFn,
) -> dict[str, object]:
    graph_json = (
        graph_json
        if isinstance(graph_json, dict)
        else workflow_version.graph_json
        if isinstance(workflow_version.graph_json, dict)
        else {}
    )
    source_node = _first_sentinel_node(graph_json)
    if source_node is None:
        raise LookupError("No Sentinel-2 source node is defined in the workflow graph.")
    source_node_id = str(source_node.get("id", "sentinel-source"))
    params = parse_sentinel_download_params(
        source_node.get("params", {}) if isinstance(source_node.get("params", {}), dict) else {}
    )
    credential = resolve_credential(params.credential_mode, params.personal_credential_id)

    download_dir = storage_root / "workflow-runs" / run_id / source_node_id
    scene_stub = params.output_dataset_name or "sentinel2-scene"
    download_path = download_dir / f"{_slugify(scene_stub)}.tif"
    scene_metadata = download_sentinel_scene(params, credential, download_path)
    dataset_name = params.output_dataset_name or f"Sentinel-2 {scene_metadata['scene_id']}"

    saved_dataset = create_private_dataset_version(
        db=db,
        workspace_id=workspace_id,
        current_user=current_user,
        run_id=run_id,
        dataset_name=dataset_name,
        kind=DatasetKind.RASTER,
        source_path=download_path,
        content_type="image/tiff",
        bbox=list(params.bbox),
        dataset_description="Sentinel-2 scene downloaded from Google Earth Engine.",
        metadata={
            "provider": "google-earth-engine",
            "source_node_id": source_node_id,
            "scene": scene_metadata,
        },
    )

    return {
        "result_dataset_version_id": saved_dataset.id,
        "saved_dataset_version_ids": [saved_dataset.id],
        "saved_model_version_ids": [],
        "result_model_version_id": None,
        "artifact_path": str(download_path.resolve()),
        "metrics": {
            "provider": "google-earth-engine",
            "collection": SENTINEL2_COLLECTION_ID,
            "scene_id": scene_metadata["scene_id"],
            "cloud_cover": scene_metadata["cloud_cover"],
            "acquired_at": scene_metadata["acquired_at"],
            "bands": list(params.bands),
            "scale": scene_metadata.get("scale", params.scale),
            "requested_scale": scene_metadata.get("requested_scale", params.scale),
            "scale_adjusted": bool(scene_metadata.get("scale_adjusted")),
        },
    }
