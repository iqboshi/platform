from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.core.settings import get_settings
from platform_backend.domain_enums import (
    ApprovalStatus,
    EmailVerificationScene,
    RoleKey,
    RoleUpgradeRequestStatus,
)
from platform_backend.models.entities import (
    EmailVerificationChallenge,
    ImageCaptchaChallenge,
    RoleUpgradeRequest,
    User,
    UserProfileDetail,
)
from platform_backend.schemas.auth import (
    EmailCodeSendRequest,
    EmailCodeSendResponse,
    ImageCaptchaResponse,
    PasswordChangeRequest,
    PendingUserSummary,
    RegisterRequest,
    RoleUpgradeRequestCreateRequest,
    RoleUpgradeRequestReviewRequest,
    RoleUpgradeRequestSummary,
    UserProfileUpdateRequest,
)
from platform_backend.schemas.platform import TokenResponse, UserProfile
from platform_backend.services.email_settings import get_effective_email_config
from platform_backend.services.mailer import send_text_email
from platform_backend.services.permissions import ROLE_PERMISSIONS


class AuthFlowError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _user_profile_detail(db: Session, user_id: str) -> UserProfileDetail | None:
    return db.scalar(select(UserProfileDetail).where(UserProfileDetail.user_id == user_id))


def _ensure_user_profile_detail(db: Session, user_id: str) -> UserProfileDetail:
    row = _user_profile_detail(db, user_id)
    if row is None:
        row = UserProfileDetail(user_id=user_id)
        db.add(row)
        db.flush()
    return row


def generate_image_captcha_code() -> str:
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(4))


def generate_email_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _captcha_data_url(text: str) -> str:
    noise_lines = []
    for _ in range(6):
        x1 = secrets.randbelow(220)
        x2 = secrets.randbelow(220)
        y1 = 15 + secrets.randbelow(45)
        y2 = 15 + secrets.randbelow(45)
        color = (
            f"rgba({40 + secrets.randbelow(160)}, "
            f"{80 + secrets.randbelow(120)}, "
            f"{120 + secrets.randbelow(100)}, 0.35)"
        )
        noise_lines.append(
            f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' stroke='{color}' stroke-width='1.4' />"
        )

    letters = []
    for index, char in enumerate(text):
        x = 28 + index * 42 + secrets.randbelow(7)
        y = 43 + secrets.randbelow(10)
        rotation = secrets.randbelow(21) - 10
        letters.append(
            (
                f"<text x='{x}' y='{y}' transform='rotate({rotation} {x} {y})' "
                "font-family='Arial, sans-serif' font-size='28' font-weight='700' "
                "fill='#1d1d1f'>"
                f"{char}</text>"
            )
        )

    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='72' viewBox='0 0 220 72'>"
        "<defs><linearGradient id='bg' x1='0%' y1='0%' x2='100%' y2='100%'>"
        "<stop offset='0%' stop-color='#ffffff' stop-opacity='0.96' />"
        "<stop offset='100%' stop-color='#dfe9ff' stop-opacity='0.92' />"
        "</linearGradient></defs>"
        "<rect x='1' y='1' width='218' height='70' rx='18' fill='url(#bg)' stroke='#c7d7ff' />"
        f"{''.join(noise_lines)}"
        f"{''.join(letters)}"
        "</svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == _normalize_email(email)))


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def list_pending_users(db: Session) -> list[PendingUserSummary]:
    rows = db.scalars(
        select(User)
        .where(User.approval_status == ApprovalStatus.PENDING)
        .order_by(User.created_at.asc())
    ).all()
    return [to_pending_user_summary(row) for row in rows]


def create_image_captcha(db: Session) -> ImageCaptchaResponse:
    email_config = get_effective_email_config(db)
    code = generate_image_captcha_code()
    expires_at = _utc_now() + timedelta(minutes=email_config.image_captcha_expire_minutes)
    row = ImageCaptchaChallenge(
        code_hash=_hash_secret(code),
        expires_at=expires_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ImageCaptchaResponse(
        captcha_key=row.id,
        image_data_url=_captcha_data_url(code),
        expires_in_seconds=email_config.image_captcha_expire_minutes * 60,
    )


def _load_captcha_challenge(db: Session, captcha_key: str) -> ImageCaptchaChallenge:
    row = db.get(ImageCaptchaChallenge, captcha_key)
    if row is None:
        raise AuthFlowError("captcha_invalid", "The image captcha is invalid.")
    if row.consumed_at is not None:
        raise AuthFlowError("captcha_invalid", "The image captcha has already been used.")
    if _coerce_utc(row.expires_at) <= _utc_now():
        row.consumed_at = _utc_now()
        db.commit()
        raise AuthFlowError("captcha_expired", "The image captcha has expired.")
    return row


def _verify_image_captcha(db: Session, captcha_key: str, captcha_code: str) -> None:
    row = _load_captcha_challenge(db, captcha_key)
    candidate_hash = _hash_secret(captcha_code)
    if not secrets.compare_digest(candidate_hash, row.code_hash):
        row.attempt_count += 1
        if row.attempt_count >= 5:
            row.consumed_at = _utc_now()
        db.commit()
        raise AuthFlowError("captcha_invalid", "The image captcha is incorrect.")

    row.consumed_at = _utc_now()
    db.commit()


def _active_email_code_query(
    email: str,
    scene: EmailVerificationScene,
    requested_by_user_id: str | None,
):
    statement = select(EmailVerificationChallenge).where(
        EmailVerificationChallenge.email == email,
        EmailVerificationChallenge.scene == scene,
    )
    if requested_by_user_id is None:
        statement = statement.where(EmailVerificationChallenge.requested_by_user_id.is_(None))
    else:
        statement = statement.where(
            EmailVerificationChallenge.requested_by_user_id == requested_by_user_id
        )
    return statement.order_by(
        EmailVerificationChallenge.created_at.desc(),
        EmailVerificationChallenge.updated_at.desc(),
    )


def _load_active_email_code(
    db: Session,
    email: str,
    scene: EmailVerificationScene,
    requested_by_user_id: str | None,
) -> EmailVerificationChallenge | None:
    return db.scalar(_active_email_code_query(email, scene, requested_by_user_id))


def _ensure_email_code(
    db: Session,
    *,
    email: str,
    scene: EmailVerificationScene,
    code: str,
    requested_by_user_id: str | None,
) -> None:
    normalized_email = _normalize_email(email)
    if not code.strip():
        raise AuthFlowError("email_code_required", "Email verification code is required.")

    row = _load_active_email_code(db, normalized_email, scene, requested_by_user_id)
    if row is None or row.consumed_at is not None:
        raise AuthFlowError("email_code_invalid", "Email verification code is invalid.")
    if _coerce_utc(row.expires_at) <= _utc_now():
        row.consumed_at = _utc_now()
        db.commit()
        raise AuthFlowError("email_code_expired", "Email verification code has expired.")

    candidate_hash = _hash_secret(code)
    if not secrets.compare_digest(candidate_hash, row.code_hash):
        row.attempt_count += 1
        if row.attempt_count >= 5:
            row.consumed_at = _utc_now()
        db.commit()
        raise AuthFlowError("email_code_invalid", "Email verification code is invalid.")

    row.consumed_at = _utc_now()
    db.commit()


def send_email_verification_code(
    db: Session,
    request: EmailCodeSendRequest,
    current_user: UserProfile | None,
) -> EmailCodeSendResponse:
    email_config = get_effective_email_config(db)
    if not email_config.email_enabled:
        raise AuthFlowError(
            "email_verification_disabled",
            "Email verification is not enabled on this platform.",
            503,
        )

    email = _normalize_email(request.email)
    requested_by_user_id: str | None = None
    if request.scene == EmailVerificationScene.REGISTER:
        if get_user_by_email(db, email) is not None:
            raise AuthFlowError("email_exists", "Email is already registered.", 409)
    else:
        if current_user is None:
            raise AuthFlowError(
                "missing_token",
                "Authentication token is required.",
                401,
            )
        if email == _normalize_email(current_user.email):
            raise AuthFlowError("email_unchanged", "The new email must be different.")
        if get_user_by_email(db, email) is not None:
            raise AuthFlowError("email_exists", "Email is already registered.", 409)
        requested_by_user_id = current_user.id

    _verify_image_captcha(db, request.captcha_key, request.captcha_code)

    current_challenge = _load_active_email_code(db, email, request.scene, requested_by_user_id)
    if current_challenge and current_challenge.consumed_at is None:
        elapsed = (_utc_now() - _coerce_utc(current_challenge.last_sent_at)).total_seconds()
        if elapsed < email_config.email_code_resend_seconds:
            remaining = max(1, int(email_config.email_code_resend_seconds - elapsed))
            raise AuthFlowError(
                "email_code_send_cooldown",
                f"Please wait {remaining} seconds before requesting another email code.",
                429,
            )
        current_challenge.consumed_at = _utc_now()
        db.commit()

    verification_code = generate_email_verification_code()
    subject = "Platform RS Studio verification code"
    body = (
        "Your verification code is "
        f"{verification_code}. It expires in {email_config.email_code_expire_minutes} minutes."
    )
    try:
        send_text_email(
            to_email=email,
            subject=subject,
            body=body,
            config=email_config,
        )
    except Exception as exc:  # pragma: no cover - SMTP provider failure path
        raise AuthFlowError(
            "email_delivery_failed",
            f"Failed to send verification email: {exc}",
            502,
        ) from exc

    now = _utc_now()
    challenge = EmailVerificationChallenge(
        email=email,
        scene=request.scene,
        requested_by_user_id=requested_by_user_id,
        code_hash=_hash_secret(verification_code),
        expires_at=now + timedelta(minutes=email_config.email_code_expire_minutes),
        last_sent_at=now,
    )
    db.add(challenge)
    db.commit()
    return EmailCodeSendResponse(
        message="Verification email sent.",
        resend_after_seconds=email_config.email_code_resend_seconds,
    )


def register_user(db: Session, request: RegisterRequest) -> User:
    email = _normalize_email(request.email)
    if get_user_by_email(db, email) is not None:
        raise ValueError("Email is already registered.")

    _ensure_email_code(
        db,
        email=email,
        scene=EmailVerificationScene.REGISTER,
        code=request.email_code,
        requested_by_user_id=None,
    )

    salt = secrets.token_hex(16)
    user = User(
        email=email,
        display_name=request.display_name.strip(),
        password_salt=salt,
        password_hash=_hash_password(request.password, salt),
        role_key=RoleKey.MEMBER,
        approval_status=ApprovalStatus.PENDING,
        preferred_locale=request.preferred_locale,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not user.is_active:
        return None

    candidate_hash = _hash_password(password, user.password_salt)
    if secrets.compare_digest(candidate_hash, user.password_hash):
        return user
    return None


def approve_user(db: Session, user_id: str, role: RoleKey) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")
    user.approval_status = ApprovalStatus.APPROVED
    user.role_key = role
    db.commit()
    db.refresh(user)
    return user


def reject_user(db: Session, user_id: str) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")
    user.approval_status = ApprovalStatus.REJECTED
    db.commit()
    db.refresh(user)
    return user


def update_user_profile(
    db: Session,
    user_id: str,
    request: UserProfileUpdateRequest,
) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")

    if request.display_name is not None:
        display_name = request.display_name.strip()
        if not display_name:
            raise AuthFlowError("display_name_invalid", "Display name is required.")
        user.display_name = display_name

    if request.preferred_locale is not None:
        user.preferred_locale = request.preferred_locale

    if request.email is not None:
        normalized_email = _normalize_email(request.email)
        if normalized_email != user.email:
            if get_user_by_email(db, normalized_email) is not None:
                raise AuthFlowError("email_exists", "Email is already registered.", 409)
            _ensure_email_code(
                db,
                email=normalized_email,
                scene=EmailVerificationScene.CHANGE_EMAIL,
                code=request.email_code or "",
                requested_by_user_id=user.id,
            )
            user.email = normalized_email

    detail_updates = any(
        value is not None
        for value in (
            request.avatar_url,
            request.job_title,
            request.organization,
            request.bio,
        )
    )
    if detail_updates:
        detail = _ensure_user_profile_detail(db, user.id)
        if request.avatar_url is not None:
            avatar_url = request.avatar_url.strip()
            if avatar_url and len(avatar_url) > 1_000_000:
                raise AuthFlowError("avatar_too_large", "Avatar payload is too large.")
            detail.avatar_url = avatar_url
        if request.job_title is not None:
            detail.job_title = request.job_title.strip()
        if request.organization is not None:
            detail.organization = request.organization.strip()
        if request.bio is not None:
            detail.bio = request.bio.strip()

    db.commit()
    db.refresh(user)
    return user


def change_user_password(
    db: Session,
    user_id: str,
    request: PasswordChangeRequest,
) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")

    current_hash = _hash_password(request.current_password, user.password_salt)
    if not secrets.compare_digest(current_hash, user.password_hash):
        raise AuthFlowError(
            "current_password_invalid",
            "Current password is incorrect.",
        )

    salt = secrets.token_hex(16)
    user.password_salt = salt
    user.password_hash = _hash_password(request.new_password, salt)
    db.commit()
    db.refresh(user)
    return user


def _role_upgrade_summary(
    row: RoleUpgradeRequest,
    user: User,
    reviewer: User | None,
) -> RoleUpgradeRequestSummary:
    return RoleUpgradeRequestSummary(
        id=row.id,
        user_id=row.user_id,
        user_display_name=user.display_name,
        user_email=user.email,
        current_role=row.current_role,
        requested_role=row.requested_role,
        status=row.status,
        reason=row.reason,
        review_note=row.review_note,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
        reviewed_by=row.reviewed_by,
        reviewed_by_display_name=reviewer.display_name if reviewer else None,
    )


def list_my_role_upgrade_requests(db: Session, user_id: str) -> list[RoleUpgradeRequestSummary]:
    rows = db.scalars(
        select(RoleUpgradeRequest)
        .where(RoleUpgradeRequest.user_id == user_id)
        .order_by(RoleUpgradeRequest.created_at.desc())
    ).all()
    user = get_user_by_id(db, user_id)
    if user is None:
        return []
    return [
        _role_upgrade_summary(
            row,
            user,
            get_user_by_id(db, row.reviewed_by) if row.reviewed_by else None,
        )
        for row in rows
    ]


def list_role_upgrade_requests(db: Session) -> list[RoleUpgradeRequestSummary]:
    rows = db.scalars(
        select(RoleUpgradeRequest).order_by(RoleUpgradeRequest.created_at.desc())
    ).all()
    if not rows:
        return []
    user_ids = {row.user_id for row in rows} | {row.reviewed_by for row in rows if row.reviewed_by}
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    user_map = {row.id: row for row in users}
    return [
        _role_upgrade_summary(row, user_map[row.user_id], user_map.get(row.reviewed_by))
        for row in rows
        if row.user_id in user_map
    ]


def create_role_upgrade_request(
    db: Session,
    user_id: str,
    request: RoleUpgradeRequestCreateRequest,
) -> RoleUpgradeRequestSummary:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")
    if user.role_key != RoleKey.MEMBER:
        raise AuthFlowError(
            "role_upgrade_not_allowed",
            "Only members can request a role upgrade.",
        )

    existing = db.scalar(
        select(RoleUpgradeRequest)
        .where(
            RoleUpgradeRequest.user_id == user_id,
            RoleUpgradeRequest.status == RoleUpgradeRequestStatus.PENDING,
        )
        .order_by(RoleUpgradeRequest.created_at.desc())
    )
    if existing is not None:
        raise AuthFlowError(
            "role_upgrade_pending_exists",
            "A pending role upgrade request already exists.",
            409,
        )

    row = RoleUpgradeRequest(
        user_id=user.id,
        current_role=user.role_key,
        requested_role=RoleKey.ML_ENGINEER,
        status=RoleUpgradeRequestStatus.PENDING,
        reason=request.reason.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _role_upgrade_summary(row, user, None)


def approve_role_upgrade_request(
    db: Session,
    request_id: str,
    reviewer_id: str,
    request: RoleUpgradeRequestReviewRequest,
) -> RoleUpgradeRequestSummary:
    row = db.get(RoleUpgradeRequest, request_id)
    if row is None:
        raise LookupError("Role upgrade request not found.")
    if row.status != RoleUpgradeRequestStatus.PENDING:
        raise AuthFlowError(
            "role_upgrade_processed",
            "This role upgrade request is already processed.",
        )

    user = get_user_by_id(db, row.user_id)
    reviewer = get_user_by_id(db, reviewer_id)
    if user is None or reviewer is None:
        raise LookupError("User not found.")

    row.status = RoleUpgradeRequestStatus.APPROVED
    row.review_note = request.review_note.strip()
    row.reviewed_by = reviewer_id
    row.reviewed_at = _utc_now()
    user.role_key = row.requested_role
    db.commit()
    db.refresh(row)
    db.refresh(user)
    return _role_upgrade_summary(row, user, reviewer)


def reject_role_upgrade_request(
    db: Session,
    request_id: str,
    reviewer_id: str,
    request: RoleUpgradeRequestReviewRequest,
) -> RoleUpgradeRequestSummary:
    row = db.get(RoleUpgradeRequest, request_id)
    if row is None:
        raise LookupError("Role upgrade request not found.")
    if row.status != RoleUpgradeRequestStatus.PENDING:
        raise AuthFlowError(
            "role_upgrade_processed",
            "This role upgrade request is already processed.",
        )

    user = get_user_by_id(db, row.user_id)
    reviewer = get_user_by_id(db, reviewer_id)
    if user is None or reviewer is None:
        raise LookupError("User not found.")

    row.status = RoleUpgradeRequestStatus.REJECTED
    row.review_note = request.review_note.strip()
    row.reviewed_by = reviewer_id
    row.reviewed_at = _utc_now()
    db.commit()
    db.refresh(row)
    return _role_upgrade_summary(row, user, reviewer)


def create_access_token(user: User) -> str:
    settings = get_settings()
    expires_at = _utc_now() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user.id,
        "role": user.role_key.value,
        "approval_status": user.approval_status.value,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, str]:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def touch_last_login(db: Session, user: User) -> None:
    user.last_login_at = _utc_now()
    db.commit()


def to_user_profile(user: User, db: Session | None = None) -> UserProfile:
    permissions = sorted(ROLE_PERMISSIONS.get(user.role_key, set()))
    profile_detail = _user_profile_detail(db, user.id) if db is not None else None
    return UserProfile(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role_key,
        approval_status=user.approval_status,
        preferred_locale=user.preferred_locale,
        avatar_url=profile_detail.avatar_url if profile_detail else "",
        job_title=profile_detail.job_title if profile_detail else "",
        organization=profile_detail.organization if profile_detail else "",
        bio=profile_detail.bio if profile_detail else "",
        last_login_at=user.last_login_at,
        permissions=permissions,
    )


def to_token_response(user: User, db: Session | None = None) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user),
        user=to_user_profile(user, db),
    )


def to_pending_user_summary(user: User) -> PendingUserSummary:
    return PendingUserSummary(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role_key,
        approval_status=user.approval_status,
        preferred_locale=user.preferred_locale,
        created_at=user.created_at,
    )
