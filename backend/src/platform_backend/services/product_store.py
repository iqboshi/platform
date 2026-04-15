from __future__ import annotations

import mimetypes
import shutil
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.core.settings import get_settings
from platform_backend.domain_enums import RoleKey
from platform_backend.models.entities import ProductAsset, User
from platform_backend.schemas.platform import ProductAssetSummary, UserProfile

_SUPPORTED_PRODUCT_EXTENSIONS = {".stp", ".step", ".igs", ".iges"}


def _storage_root() -> Path:
    root = Path(get_settings().storage_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slugify(value: str) -> str:
    return (
        "".join(
            character if character.isalnum() or character in {"-", "_"} else "-"
            for character in value
        ).strip("-_")
        or "product"
    )


def _normalize_visibility(value: str | None) -> str:
    normalized = str(value or "private").strip().lower()
    if normalized not in {"private", "public"}:
        raise ValueError("Product visibility must be either 'private' or 'public'.")
    return normalized


def _normalize_string_list(values: list[str] | None) -> list[str]:
    if not values:
        return []
    normalized: list[str] = []
    for item in values:
        value = str(item).strip()
        if value:
            normalized.append(value)
    return normalized


def _normalize_specifications(values: dict[str, str] | None) -> dict[str, str]:
    if not values:
        return {}
    normalized: dict[str, str] = {}
    for key, value in values.items():
        normalized_key = str(key).strip()
        normalized_value = str(value).strip()
        if normalized_key and normalized_value:
            normalized[normalized_key] = normalized_value
    return normalized


def _is_admin_user(current_user: UserProfile | User | None) -> bool:
    if current_user is None:
        return False
    if isinstance(current_user, UserProfile):
        return current_user.role == RoleKey.ADMIN
    return current_user.role_key == RoleKey.ADMIN


def _ensure_supported_product_file(file_name: str) -> str:
    extension = Path(file_name).suffix.lower()
    if extension not in _SUPPORTED_PRODUCT_EXTENSIONS:
        raise ValueError("Only STP / STEP / IGS / IGES product files are supported.")
    return extension


def _can_manage_product(row: ProductAsset, current_user: UserProfile | User | None) -> bool:
    if current_user is None:
        return False
    if _is_admin_user(current_user):
        return True
    return row.owner_user_id == current_user.id


def _can_access_product(row: ProductAsset, current_user: UserProfile | User | None) -> bool:
    return row.visibility == "public" or _can_manage_product(row, current_user)


def _product_summary(
    row: ProductAsset,
    owner_display_name: str | None,
) -> ProductAssetSummary:
    return ProductAssetSummary(
        id=row.id,
        workspace_id=row.workspace_id,
        owner_user_id=row.owner_user_id,
        owner_display_name=owner_display_name,
        name=row.name,
        description=row.description,
        category=row.category,
        tags=row.tags_json if isinstance(row.tags_json, list) else [],
        highlights=row.highlights_json if isinstance(row.highlights_json, list) else [],
        specifications=(
            {
                str(key): str(value)
                for key, value in row.specifications_json.items()
                if str(key).strip() and str(value).strip()
            }
            if isinstance(row.specifications_json, dict)
            else {}
        ),
        visibility=_normalize_visibility(row.visibility),
        asset_path=row.asset_path,
        original_file_name=row.original_file_name,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _write_product_file(
    product_id: str,
    *,
    upload_file: BinaryIO,
    original_file_name: str,
) -> Path:
    extension = _ensure_supported_product_file(original_file_name)
    target_dir = _storage_root() / "products" / product_id
    target_dir.mkdir(parents=True, exist_ok=True)
    for existing in target_dir.iterdir():
        if existing.is_file():
            try:
                existing.unlink()
            except OSError:
                pass

    target_path = target_dir / f"{_slugify(Path(original_file_name).stem)}{extension}"
    upload_file.seek(0)
    with target_path.open("wb") as handle:
        shutil.copyfileobj(upload_file, handle)
    return target_path


def list_product_assets(
    db: Session,
    *,
    current_user: UserProfile | User | None,
    scope: str = "visible",
    visibility: str | None = None,
) -> list[ProductAssetSummary]:
    rows = db.scalars(
        select(ProductAsset).order_by(
            ProductAsset.updated_at.desc(),
            ProductAsset.created_at.desc(),
        )
    ).all()

    if scope == "all":
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can list all product assets.")
    elif scope == "mine":
        if current_user is None:
            rows = []
        else:
            rows = [row for row in rows if row.owner_user_id == current_user.id]
    else:
        rows = [row for row in rows if _can_access_product(row, current_user)]

    if visibility is not None:
        normalized_visibility = _normalize_visibility(visibility)
        rows = [row for row in rows if row.visibility == normalized_visibility]

    owner_ids = {row.owner_user_id for row in rows}
    owner_names = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_(owner_ids))).all()
    }
    return [_product_summary(row, owner_names.get(row.owner_user_id)) for row in rows]


def create_product_asset(
    db: Session,
    *,
    workspace_id: str,
    name: str,
    description: str | None,
    category: str | None,
    tags: list[str] | None,
    highlights: list[str] | None,
    specifications: dict[str, str] | None,
    visibility: str | None,
    current_user: UserProfile | User,
    upload_file: BinaryIO,
    original_file_name: str,
    content_type: str,
    size_bytes: int,
) -> ProductAssetSummary:
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("Product name is required.")

    normalized_visibility = "private"
    if visibility is not None:
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can publish product assets.")
        normalized_visibility = _normalize_visibility(visibility)

    row = ProductAsset(
        workspace_id=workspace_id,
        owner_user_id=current_user.id,
        name=normalized_name,
        description=(description or "").strip(),
        category=(category or "").strip(),
        tags_json=_normalize_string_list(tags),
        highlights_json=_normalize_string_list(highlights),
        specifications_json=_normalize_specifications(specifications),
        visibility=normalized_visibility,
        asset_path="",
        original_file_name=original_file_name,
        content_type=content_type,
        size_bytes=size_bytes,
    )
    db.add(row)
    db.flush()

    target_path = _write_product_file(
        row.id,
        upload_file=upload_file,
        original_file_name=original_file_name,
    )
    row.asset_path = str(target_path.resolve())
    row.size_bytes = target_path.stat().st_size
    row.content_type = (
        content_type or mimetypes.guess_type(target_path.name)[0] or "application/octet-stream"
    )
    row.original_file_name = original_file_name
    db.commit()
    db.refresh(row)
    return _product_summary(row, current_user.display_name)


def update_product_asset(
    db: Session,
    product_id: str,
    *,
    current_user: UserProfile | User,
    name: str | None = None,
    description: str | None = None,
    category: str | None = None,
    tags: list[str] | None = None,
    highlights: list[str] | None = None,
    specifications: dict[str, str] | None = None,
    visibility: str | None = None,
    upload_file: BinaryIO | None = None,
    original_file_name: str | None = None,
    content_type: str | None = None,
    size_bytes: int | None = None,
) -> ProductAssetSummary:
    row = db.get(ProductAsset, product_id)
    if row is None:
        raise LookupError("Product asset not found.")
    if not _can_manage_product(row, current_user):
        raise PermissionError("Only the owner or an administrator can edit this product asset.")

    if name is not None:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Product name is required.")
        row.name = normalized_name
    if description is not None:
        row.description = description.strip()
    if category is not None:
        row.category = category.strip()
    if tags is not None:
        row.tags_json = _normalize_string_list(tags)
    if highlights is not None:
        row.highlights_json = _normalize_string_list(highlights)
    if specifications is not None:
        row.specifications_json = _normalize_specifications(specifications)
    if visibility is not None:
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can change product visibility.")
        row.visibility = _normalize_visibility(visibility)
    if upload_file is not None:
        if not original_file_name:
            raise ValueError("A replacement product file must include a filename.")
        target_path = _write_product_file(
            row.id,
            upload_file=upload_file,
            original_file_name=original_file_name,
        )
        row.asset_path = str(target_path.resolve())
        row.original_file_name = original_file_name
        row.content_type = (
            content_type or mimetypes.guess_type(target_path.name)[0] or "application/octet-stream"
        )
        row.size_bytes = size_bytes if size_bytes is not None else target_path.stat().st_size

    db.commit()
    db.refresh(row)
    owner = db.get(User, row.owner_user_id)
    return _product_summary(row, owner.display_name if owner is not None else None)


def delete_product_asset(
    db: Session,
    product_id: str,
    *,
    current_user: UserProfile | User,
) -> None:
    row = db.get(ProductAsset, product_id)
    if row is None:
        raise LookupError("Product asset not found.")
    if not _can_manage_product(row, current_user):
        raise PermissionError("Only the owner or an administrator can delete this product asset.")

    asset_path = Path(row.asset_path)
    asset_dir = asset_path.parent
    db.delete(row)
    db.commit()

    if asset_path.exists():
        try:
            asset_path.unlink()
        except OSError:
            pass
    if asset_dir.exists():
        try:
            asset_dir.rmdir()
        except OSError:
            pass


def get_product_asset_download_payload(
    db: Session,
    product_id: str,
    *,
    current_user: UserProfile | User | None,
) -> tuple[Path, str, str] | None:
    row = db.get(ProductAsset, product_id)
    if row is None or not _can_access_product(row, current_user):
        return None

    file_path = Path(row.asset_path)
    media_type = (
        row.content_type
        or mimetypes.guess_type(row.original_file_name)[0]
        or "application/octet-stream"
    )
    return file_path, row.original_file_name, media_type
