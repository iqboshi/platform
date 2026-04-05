from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import (
    FeedbackTicketCreateRequest,
    FeedbackTicketSummary,
    FeedbackTicketSummaryCounts,
    FeedbackTicketUpdateRequest,
    UserProfile,
)
from platform_backend.services.portal_store import (
    create_feedback_ticket,
    feedback_ticket_summary_counts,
    get_feedback_ticket,
    list_feedback_tickets,
    update_feedback_ticket,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
WorkspaceViewUserDep = Annotated[UserProfile, Depends(require_permission("workspace.view"))]


@router.get(
    "/summary",
    response_model=FeedbackTicketSummaryCounts,
)
def feedback_ticket_summary_route(
    db: DatabaseDep,
    current_user: WorkspaceViewUserDep,
) -> FeedbackTicketSummaryCounts:
    return feedback_ticket_summary_counts(db, current_user)


@router.get(
    "",
    response_model=list[FeedbackTicketSummary],
)
def list_feedback_tickets_route(
    db: DatabaseDep,
    current_user: WorkspaceViewUserDep,
    scope: str = "mine",
    limit: int = 20,
) -> list[FeedbackTicketSummary]:
    try:
        return list_feedback_tickets(db, current_user, scope=scope, limit=limit)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "",
    response_model=FeedbackTicketSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_feedback_ticket_route(
    request: FeedbackTicketCreateRequest,
    db: DatabaseDep,
    current_user: WorkspaceViewUserDep,
) -> FeedbackTicketSummary:
    try:
        return create_feedback_ticket(db, request, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{ticket_id}",
    response_model=FeedbackTicketSummary,
)
def get_feedback_ticket_route(
    ticket_id: str,
    db: DatabaseDep,
    current_user: WorkspaceViewUserDep,
) -> FeedbackTicketSummary:
    payload = get_feedback_ticket(db, ticket_id, current_user)
    if payload is None:
        raise HTTPException(status_code=404, detail="Feedback ticket not found.")
    return payload


@router.patch(
    "/{ticket_id}",
    response_model=FeedbackTicketSummary,
)
def update_feedback_ticket_route(
    ticket_id: str,
    request: FeedbackTicketUpdateRequest,
    db: DatabaseDep,
    current_user: WorkspaceViewUserDep,
) -> FeedbackTicketSummary:
    try:
        return update_feedback_ticket(db, ticket_id, request, current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
