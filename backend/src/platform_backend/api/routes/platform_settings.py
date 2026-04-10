from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import (
    DashboardConfig,
    DashboardConfigUpdateRequest,
    EmailSettingsSummary,
    EmailSettingsUpdateRequest,
    UserProfile,
)
from platform_backend.services.email_settings import get_email_settings, update_email_settings
from platform_backend.services.portal_store import get_dashboard_config, update_dashboard_config

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
WorkspaceViewUserDep = Annotated[UserProfile, Depends(require_permission("workspace.view"))]
SystemConfigureUserDep = Annotated[UserProfile, Depends(require_permission("system.configure"))]


@router.get(
    "/dashboard",
    response_model=DashboardConfig,
)
def get_dashboard_config_route(
    db: DatabaseDep,
    current_user: WorkspaceViewUserDep,
) -> DashboardConfig:
    del current_user
    return get_dashboard_config(db)


@router.put(
    "/dashboard",
    response_model=DashboardConfig,
)
def update_dashboard_config_route(
    request: DashboardConfigUpdateRequest,
    db: DatabaseDep,
    current_user: SystemConfigureUserDep,
) -> DashboardConfig:
    del current_user
    return update_dashboard_config(db, request)


@router.get(
    "/email",
    response_model=EmailSettingsSummary,
)
def get_email_settings_route(
    db: DatabaseDep,
    current_user: SystemConfigureUserDep,
) -> EmailSettingsSummary:
    del current_user
    return get_email_settings(db)


@router.put(
    "/email",
    response_model=EmailSettingsSummary,
)
def update_email_settings_route(
    request: EmailSettingsUpdateRequest,
    db: DatabaseDep,
    current_user: SystemConfigureUserDep,
) -> EmailSettingsSummary:
    del current_user
    return update_email_settings(db, request)
