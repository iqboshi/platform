from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import ApiMessage, ProductAssetSummary, UserProfile
from platform_backend.services.product_store import (
    create_product_asset,
    delete_product_asset,
    get_product_asset_download_payload,
    list_product_assets,
    update_product_asset,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
WorkspaceUserDep = Annotated[UserProfile, Depends(require_permission("workspace.view"))]


def _parse_string_list(raw_value: str | None, field_name: str) -> list[str] | None:
    if raw_value is None:
        return None
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise ValueError(f"{field_name} must be a JSON array of strings.")
    return parsed


def _parse_string_dict(raw_value: str | None, field_name: str) -> dict[str, str] | None:
    if raw_value is None:
        return None
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc
    if not isinstance(parsed, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in parsed.items()
    ):
        raise ValueError(f"{field_name} must be a JSON object of string pairs.")
    return parsed


@router.get("", response_model=list[ProductAssetSummary])
def list_products_route(
    db: DatabaseDep,
    current_user: WorkspaceUserDep,
    scope: str = "visible",
    visibility: str | None = None,
) -> list[ProductAssetSummary]:
    try:
        return list_product_assets(
            db,
            current_user=current_user,
            scope=scope,
            visibility=visibility,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/upload", response_model=ProductAssetSummary, status_code=status.HTTP_201_CREATED)
def upload_product_route(
    db: DatabaseDep,
    current_user: WorkspaceUserDep,
    workspace_id: Annotated[str, Form(...)],
    name: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
    description: Annotated[str | None, Form()] = None,
    category: Annotated[str | None, Form()] = None,
    tags_json: Annotated[str | None, Form()] = None,
    highlights_json: Annotated[str | None, Form()] = None,
    specifications_json: Annotated[str | None, Form()] = None,
    visibility: Annotated[str | None, Form()] = None,
) -> ProductAssetSummary:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    try:
        file.file.seek(0, 2)
        size_bytes = file.file.tell()
        file.file.seek(0)
    except OSError:
        size_bytes = 0

    try:
        return create_product_asset(
            db,
            workspace_id=workspace_id,
            name=name,
            description=description,
            category=category,
            tags=_parse_string_list(tags_json, "tags_json"),
            highlights=_parse_string_list(highlights_json, "highlights_json"),
            specifications=_parse_string_dict(specifications_json, "specifications_json"),
            visibility=visibility,
            current_user=current_user,
            upload_file=file.file,
            original_file_name=file.filename,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=size_bytes,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{product_id}", response_model=ProductAssetSummary)
def update_product_route(
    product_id: str,
    db: DatabaseDep,
    current_user: WorkspaceUserDep,
    name: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    description: Annotated[str | None, Form()] = None,
    category: Annotated[str | None, Form()] = None,
    tags_json: Annotated[str | None, Form()] = None,
    highlights_json: Annotated[str | None, Form()] = None,
    specifications_json: Annotated[str | None, Form()] = None,
    visibility: Annotated[str | None, Form()] = None,
) -> ProductAssetSummary:
    size_bytes: int | None = None
    original_file_name: str | None = None
    content_type: str | None = None
    if file is not None:
        if file.filename is None:
            raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")
        original_file_name = file.filename
        content_type = file.content_type or "application/octet-stream"
        try:
            file.file.seek(0, 2)
            size_bytes = file.file.tell()
            file.file.seek(0)
        except OSError:
            size_bytes = 0

    try:
        return update_product_asset(
            db,
            product_id,
            current_user=current_user,
            name=name,
            description=description,
            category=category,
            tags=_parse_string_list(tags_json, "tags_json"),
            highlights=_parse_string_list(highlights_json, "highlights_json"),
            specifications=_parse_string_dict(specifications_json, "specifications_json"),
            visibility=visibility,
            upload_file=file.file if file is not None else None,
            original_file_name=original_file_name,
            content_type=content_type,
            size_bytes=size_bytes,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{product_id}/download")
def download_product_route(
    product_id: str,
    db: DatabaseDep,
    current_user: WorkspaceUserDep,
) -> FileResponse:
    payload = get_product_asset_download_payload(
        db,
        product_id,
        current_user=current_user,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Product asset not found.")

    file_path, file_name, media_type = payload
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Product asset file not found.")
    return FileResponse(file_path, filename=file_name, media_type=media_type)


@router.delete("/{product_id}", response_model=ApiMessage)
def delete_product_route(
    product_id: str,
    db: DatabaseDep,
    current_user: WorkspaceUserDep,
) -> ApiMessage:
    try:
        delete_product_asset(db, product_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return ApiMessage(message="Product asset deleted.")
