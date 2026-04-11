from __future__ import annotations


def normalize_visibility(
    value: str | None,
    *,
    default: str = "private",
    allow_workspace: bool = False,
) -> str:
    normalized = str(value or "").strip().lower() or default
    allowed = {"private", "public"}
    if allow_workspace:
        allowed.add("workspace")
    if normalized not in allowed:
        allowed_values = "', '".join(sorted(allowed))
        raise ValueError(f"Visibility must be one of '{allowed_values}'.")
    return normalized


def can_access_by_visibility(
    visibility: str,
    owner_user_id: str | None,
    *,
    current_user_id: str | None,
    is_admin: bool,
) -> bool:
    if visibility != "private":
        return True
    if current_user_id is None:
        return False
    return is_admin or owner_user_id == current_user_id


def can_manage_owned_asset(
    owner_user_id: str | None,
    *,
    current_user_id: str | None,
    is_admin: bool,
) -> bool:
    if current_user_id is None:
        return False
    return is_admin or owner_user_id == current_user_id
