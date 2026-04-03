from __future__ import annotations

from platform_backend.domain_enums import RoleKey

PermissionKey = str

ROLE_PERMISSIONS: dict[RoleKey, set[PermissionKey]] = {
    RoleKey.ADMIN: {
        "workspace.manage",
        "dataset.manage",
        "workflow.manage",
        "workflow.run",
        "model.manage",
        "system.configure",
    },
    RoleKey.ML_ENGINEER: {
        "dataset.manage",
        "workflow.manage",
        "workflow.run",
        "model.manage",
    },
    RoleKey.MEMBER: {
        "dataset.view",
        "workflow.view",
        "workflow.run",
        "result.view",
    },
}


def has_permission(role: RoleKey, permission: PermissionKey) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())
