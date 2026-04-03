from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from platform_backend.domain_enums import ApprovalStatus, LocaleCode, RoleKey


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    preferred_locale: LocaleCode = LocaleCode.ZH_CN


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
