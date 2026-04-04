from __future__ import annotations

from platform_backend.domain_enums import RoleKey

PermissionKey = str

ROLE_PERMISSIONS: dict[RoleKey, set[PermissionKey]] = {
    RoleKey.ADMIN: {
        "workspace.view",
        "workspace.manage",
        "dataset.view",
        "dataset.manage",
        "workflow.view",
        "workflow.manage",
        "workflow.run",
        "model.view",
        "model.manage",
        "job.view",
        "result.view",
        "user.approve",
        "system.configure",
    },
    RoleKey.ML_ENGINEER: {
        "workspace.view",
        "dataset.view",
        "dataset.manage",
        "workflow.view",
        "workflow.manage",
        "workflow.run",
        "model.view",
        "model.manage",
        "job.view",
        "result.view",
    },
    RoleKey.MEMBER: {
        "workspace.view",
        "dataset.view",
        "dataset.manage",
        "workflow.view",
        "workflow.manage",
        "workflow.run",
        "job.view",
        "result.view",
    },
}


def has_permission(role: RoleKey, permission: PermissionKey) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())
