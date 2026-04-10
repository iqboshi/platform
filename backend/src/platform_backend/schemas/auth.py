from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from platform_backend.domain_enums import (
    ApprovalStatus,
    EmailVerificationScene,
    LocaleCode,
    RoleKey,
    RoleUpgradeRequestStatus,
)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    email_code: str = Field(min_length=4, max_length=12)
    preferred_locale: LocaleCode = LocaleCode.ZH_CN


class ImageCaptchaResponse(BaseModel):
    captcha_key: str
    image_data_url: str
    expires_in_seconds: int


class EmailCodeSendRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    scene: EmailVerificationScene
    captcha_key: str = Field(min_length=1, max_length=64)
    captcha_code: str = Field(min_length=4, max_length=12)


class EmailCodeSendResponse(BaseModel):
    message: str
    resend_after_seconds: int


class RegisterResponse(BaseModel):
    user_id: str
    approval_status: ApprovalStatus
    message: str


class PendingUserSummary(BaseModel):
    id: str
    email: str
    display_name: str
    role: RoleKey
    approval_status: ApprovalStatus
    preferred_locale: LocaleCode
    created_at: datetime


class ApprovalRequest(BaseModel):
    role: RoleKey = RoleKey.MEMBER


class UserProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    preferred_locale: LocaleCode | None = None
    email: str | None = Field(default=None, min_length=5, max_length=255)
    email_code: str | None = Field(default=None, min_length=4, max_length=12)
    avatar_url: str | None = Field(default=None, max_length=1_000_000)
    job_title: str | None = Field(default=None, max_length=160)
    organization: str | None = Field(default=None, max_length=160)
    bio: str | None = Field(default=None, max_length=4000)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class RoleUpgradeRequestCreateRequest(BaseModel):
    reason: str = Field(min_length=4, max_length=2000)


class RoleUpgradeRequestReviewRequest(BaseModel):
    review_note: str = Field(default="", max_length=2000)


class RoleUpgradeRequestSummary(BaseModel):
    id: str
    user_id: str
    user_display_name: str
    user_email: str
    current_role: RoleKey
    requested_role: RoleKey
    status: RoleUpgradeRequestStatus
    reason: str
    review_note: str = ""
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: str | None = None
    reviewed_by_display_name: str | None = None
