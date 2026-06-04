from __future__ import annotations

from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.domain_enums import (
    FeedbackTicketStatus,
    RoleKey,
)
from platform_backend.models.entities import FeedbackTicket, PlatformSetting, User, Workspace
from platform_backend.schemas.platform import (
    DashboardAnnouncementItem,
    DashboardConfig,
    DashboardConfigUpdateRequest,
    DashboardFeatureItem,
    FeedbackTicketCreateRequest,
    FeedbackTicketSummary,
    FeedbackTicketSummaryCounts,
    FeedbackTicketUpdateRequest,
    UserProfile,
)

DASHBOARD_PLATFORM_SETTING_KEY = "portal.dashboard.content"


def _is_admin_user(current_user: UserProfile | User) -> bool:
    if isinstance(current_user, UserProfile):
        return current_user.role == RoleKey.ADMIN
    return current_user.role_key == RoleKey.ADMIN


def default_dashboard_config() -> DashboardConfig:
    today = datetime.now(UTC).date().isoformat()
    return DashboardConfig(
        feature_sections=[
            DashboardFeatureItem(
                id="public-datasets",
                title_zh="公开数据集浏览",
                title_en="Public Dataset Catalog",
                summary_zh="集中浏览公开数据集、查看简介并快速下载可用版本。",
                summary_en=(
                    "Browse published datasets, review curated descriptions, "
                    "and download usable versions quickly."
                ),
                button_label_zh="进入数据集",
                button_label_en="Open catalog",
                href="/datasets",
                icon_key="datasets",
                enabled=True,
            ),
            DashboardFeatureItem(
                id="visual-workflows",
                title_zh="可视化工作流编排",
                title_en="Visual Workflow Builder",
                summary_zh="用节点化方式组织数据处理、模型推理和结果导出流程。",
                summary_en=(
                    "Compose data preparation, model inference, and export steps "
                    "through a visual node graph."
                ),
                button_label_zh="打开工作流",
                button_label_en="Open workflows",
                href="/workflows",
                icon_key="workflows",
                enabled=True,
            ),
            DashboardFeatureItem(
                id="model-assets",
                title_zh="模型资产中心",
                title_en="Model Asset Center",
                summary_zh="统一管理平台模型、训练产物和外部 API 模型接入信息。",
                summary_en=(
                    "Manage packaged models, trained weights, and external API model "
                    "registrations in one place."
                ),
                button_label_zh="查看模型",
                button_label_en="View models",
                href="/models",
                icon_key="models",
                enabled=True,
            ),
            DashboardFeatureItem(
                id="personal-assets",
                title_zh="个人资产管理",
                title_en="Personal Asset Control",
                summary_zh="统一查看和维护个人数据集、结果、工作流与凭证资产。",
                summary_en=(
                    "Review and manage your datasets, results, workflows, and credentials "
                    "from a single workspace view."
                ),
                button_label_zh="进入个人资产",
                button_label_en="Open my assets",
                href="/assets",
                icon_key="assets",
                enabled=True,
            ),
        ],
        announcements=[
            DashboardAnnouncementItem(
                id="ops-portal-upgrade",
                title_zh="总览页升级为运营门户",
                title_en="Overview Upgraded to an Operations Portal",
                summary_zh="新的首页聚合了能力介绍、更新公告、快速入口和反馈工作台。",
                summary_en=(
                    "The new landing page brings together product highlights, updates, "
                    "quick actions, and a feedback workbench."
                ),
                content_zh=(
                    "总览页整合平台能力、核心入口、更新公告和反馈工单，"
                    "方便团队从首页进入日常操作。"
                ),
                content_en=(
                    "The overview page has been upgraded from a lightweight status board "
                    "to an operations-style portal. Users can now review platform capabilities, "
                    "jump into core modules, read release notes, and submit or track tickets "
                    "directly from the landing page."
                ),
                tag_zh="平台更新",
                tag_en="Platform Update",
                published_at=today,
                pinned=True,
                published=True,
            ),
            DashboardAnnouncementItem(
                id="workflow-runtime-refresh",
                title_zh="工作流执行链路持续完善",
                title_en="Workflow Runtime Continues to Mature",
                summary_zh="已优先打通表格预测、验证链路和 Sentinel 下载链路。",
                summary_en=(
                    "Tabular prediction, validation pipelines, and Sentinel download flows "
                    "have been prioritized and made operational."
                ),
                content_zh=(
                    "当前版本强化了两类可运行工作流：CSV 表格预测/验证流程，"
                    "以及基于 GEE 的 Sentinel 下载流程。"
                ),
                content_en=(
                    "This release focuses on real, runnable workflows: CSV-based prediction "
                    "and validation pipelines, plus the Google Earth Engine Sentinel "
                    "download flow. "
                    "Additional production-grade nodes will continue to be added."
                ),
                tag_zh="工作流",
                tag_en="Workflow",
                published_at=today,
                pinned=False,
                published=True,
            ),
            DashboardAnnouncementItem(
                id="feedback-workbench-live",
                title_zh="意见反馈工作台已启用",
                title_en="Feedback Workbench is Live",
                summary_zh="成员可以提交问题、需求和体验建议，管理员可统一跟进处理。",
                summary_en=(
                    "Members can file bugs, requests, and UX notes while administrators "
                    "triage and respond from the same workflow."
                ),
                content_zh=(
                    "首页新增了完整的反馈工单入口。普通成员可以提交问题和需求，"
                    "管理员可以查看全部工单、更新状态并回复处理结果。"
                ),
                content_en=(
                    "The dashboard now includes a full feedback ticket workflow. "
                    "Members can submit bugs and requests, while administrators can review, "
                    "update status, and respond from the same portal."
                ),
                tag_zh="协作",
                tag_en="Collaboration",
                published_at=today,
                pinned=False,
                published=True,
            ),
        ],
    )


def _dashboard_setting(db: Session) -> PlatformSetting | None:
    return db.scalar(
        select(PlatformSetting).where(PlatformSetting.key == DASHBOARD_PLATFORM_SETTING_KEY)
    )


def get_dashboard_config(db: Session) -> DashboardConfig:
    row = _dashboard_setting(db)
    if row is None or not isinstance(row.value_json, dict):
        return default_dashboard_config()

    try:
        return DashboardConfig.model_validate(row.value_json)
    except ValidationError:
        return default_dashboard_config()


def update_dashboard_config(
    db: Session,
    request: DashboardConfigUpdateRequest,
) -> DashboardConfig:
    row = _dashboard_setting(db)
    if row is None:
        row = PlatformSetting(
            key=DASHBOARD_PLATFORM_SETTING_KEY,
            value_json=request.model_dump(mode="json"),
        )
        db.add(row)
    else:
        row.value_json = request.model_dump(mode="json")
    db.commit()
    return DashboardConfig.model_validate(row.value_json)


def _feedback_ticket_summary(
    row: FeedbackTicket,
    owner_display_name: str | None,
) -> FeedbackTicketSummary:
    return FeedbackTicketSummary(
        id=row.id,
        workspace_id=row.workspace_id,
        created_by=row.created_by,
        created_by_display_name=owner_display_name,
        title=row.title,
        category=row.category,
        priority=row.priority,
        status=row.status,
        content=row.content,
        contact=row.contact,
        admin_reply=row.admin_reply,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _feedback_ticket_owner_names(
    db: Session,
    rows: list[FeedbackTicket],
) -> dict[str, str]:
    owner_ids = {row.created_by for row in rows}
    if not owner_ids:
        return {}
    users = db.scalars(select(User).where(User.id.in_(owner_ids))).all()
    return {row.id: row.display_name for row in users}


def _can_access_feedback_ticket(
    row: FeedbackTicket,
    current_user: UserProfile | User,
) -> bool:
    return _is_admin_user(current_user) or row.created_by == current_user.id


def list_feedback_tickets(
    db: Session,
    current_user: UserProfile | User,
    *,
    scope: str = "mine",
    limit: int = 20,
) -> list[FeedbackTicketSummary]:
    normalized_limit = max(1, min(limit, 100))
    statement = select(FeedbackTicket).order_by(
        FeedbackTicket.updated_at.desc(),
        FeedbackTicket.created_at.desc(),
    )

    if scope == "all":
        if not _is_admin_user(current_user):
            raise PermissionError("Only administrators can list all feedback tickets.")
    elif scope == "mine":
        statement = statement.where(FeedbackTicket.created_by == current_user.id)
    else:
        raise ValueError("scope must be 'mine' or 'all'.")

    rows = db.scalars(statement.limit(normalized_limit)).all()
    owner_names = _feedback_ticket_owner_names(db, rows)
    return [_feedback_ticket_summary(row, owner_names.get(row.created_by)) for row in rows]


def get_feedback_ticket(
    db: Session,
    ticket_id: str,
    current_user: UserProfile | User,
) -> FeedbackTicketSummary | None:
    row = db.get(FeedbackTicket, ticket_id)
    if row is None or not _can_access_feedback_ticket(row, current_user):
        return None

    owner = db.get(User, row.created_by)
    return _feedback_ticket_summary(row, owner.display_name if owner else None)


def create_feedback_ticket(
    db: Session,
    request: FeedbackTicketCreateRequest,
    current_user: UserProfile | User,
) -> FeedbackTicketSummary:
    title = request.title.strip()
    content = request.content.strip()
    if not title:
        raise ValueError("Feedback title is required.")
    if not content:
        raise ValueError("Feedback content is required.")

    workspace = db.get(Workspace, request.workspace_id)
    if workspace is None:
        raise LookupError("Workspace not found.")

    row = FeedbackTicket(
        workspace_id=request.workspace_id,
        created_by=current_user.id,
        title=title,
        category=request.category,
        priority=request.priority,
        status=FeedbackTicketStatus.OPEN,
        content=content,
        contact=request.contact.strip(),
        admin_reply="",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    owner_display_name = (
        current_user.display_name
        if isinstance(current_user, UserProfile)
        else current_user.display_name
    )
    return _feedback_ticket_summary(row, owner_display_name)


def update_feedback_ticket(
    db: Session,
    ticket_id: str,
    request: FeedbackTicketUpdateRequest,
    current_user: UserProfile | User,
) -> FeedbackTicketSummary:
    row = db.get(FeedbackTicket, ticket_id)
    if row is None:
        raise LookupError("Feedback ticket not found.")
    if not _can_access_feedback_ticket(row, current_user):
        raise PermissionError("You do not have access to this feedback ticket.")

    is_admin = _is_admin_user(current_user)
    is_owner = row.created_by == current_user.id
    if not is_admin and not is_owner:
        raise PermissionError("You do not have access to this feedback ticket.")

    if not is_admin and row.status in {
        FeedbackTicketStatus.RESOLVED,
        FeedbackTicketStatus.CLOSED,
    }:
        raise PermissionError(
            "Resolved or closed feedback tickets can only be updated by administrators."
        )

    if request.title is not None:
        title = request.title.strip()
        if not title:
            raise ValueError("Feedback title is required.")
        row.title = title
    if request.content is not None:
        content = request.content.strip()
        if not content:
            raise ValueError("Feedback content is required.")
        row.content = content
    if request.contact is not None:
        row.contact = request.contact.strip()
    if request.category is not None:
        row.category = request.category
    if request.priority is not None:
        row.priority = request.priority

    if request.status is not None:
        if not is_admin:
            raise PermissionError("Only administrators can change feedback ticket status.")
        row.status = request.status

    if request.admin_reply is not None:
        if not is_admin:
            raise PermissionError("Only administrators can reply to feedback tickets.")
        row.admin_reply = request.admin_reply.strip()

    db.commit()
    db.refresh(row)
    owner = db.get(User, row.created_by)
    return _feedback_ticket_summary(row, owner.display_name if owner else None)


def feedback_ticket_summary_counts(
    db: Session,
    current_user: UserProfile | User,
) -> FeedbackTicketSummaryCounts:
    my_rows = db.scalars(
        select(FeedbackTicket.status).where(FeedbackTicket.created_by == current_user.id)
    ).all()
    my_open_count = sum(1 for status in my_rows if status == FeedbackTicketStatus.OPEN)
    my_active_count = sum(
        1
        for status in my_rows
        if status in {FeedbackTicketStatus.OPEN, FeedbackTicketStatus.IN_PROGRESS}
    )

    admin_open_count = 0
    admin_in_progress_count = 0
    if _is_admin_user(current_user):
        admin_rows = db.scalars(select(FeedbackTicket.status)).all()
        admin_open_count = sum(1 for status in admin_rows if status == FeedbackTicketStatus.OPEN)
        admin_in_progress_count = sum(
            1 for status in admin_rows if status == FeedbackTicketStatus.IN_PROGRESS
        )

    return FeedbackTicketSummaryCounts(
        my_open_count=my_open_count,
        my_active_count=my_active_count,
        admin_open_count=admin_open_count,
        admin_in_progress_count=admin_in_progress_count,
    )
