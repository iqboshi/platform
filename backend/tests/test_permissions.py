from platform_backend.domain_enums import RoleKey
from platform_backend.services.permissions import has_permission


def test_member_cannot_manage_models() -> None:
    assert not has_permission(RoleKey.MEMBER, "model.manage")


def test_admin_can_configure_system() -> None:
    assert has_permission(RoleKey.ADMIN, "system.configure")
