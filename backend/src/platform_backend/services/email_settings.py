from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.core.settings import get_settings
from platform_backend.models.entities import PlatformSetting
from platform_backend.schemas.platform import EmailSettingsSummary, EmailSettingsUpdateRequest

EMAIL_PLATFORM_SETTING_KEY = "system.email.config"


@dataclass(slots=True)
class EmailRuntimeConfig:
    email_enabled: bool
    smtp_host: str
    smtp_port: int
    smtp_use_ssl: bool
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str
    smtp_timeout_seconds: int
    email_code_expire_minutes: int
    email_code_resend_seconds: int
    image_captcha_expire_minutes: int


def _platform_setting(db: Session) -> PlatformSetting | None:
    return db.scalar(
        select(PlatformSetting).where(
            PlatformSetting.key == EMAIL_PLATFORM_SETTING_KEY
        )
    )


def _settings_from_env() -> EmailRuntimeConfig:
    settings = get_settings()
    return EmailRuntimeConfig(
        email_enabled=settings.email_enabled,
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_use_ssl=settings.smtp_use_ssl,
        smtp_username=settings.smtp_username,
        smtp_password=settings.smtp_password,
        smtp_from_email=settings.smtp_from_email,
        smtp_from_name=settings.smtp_from_name,
        smtp_timeout_seconds=settings.smtp_timeout_seconds,
        email_code_expire_minutes=settings.email_code_expire_minutes,
        email_code_resend_seconds=settings.email_code_resend_seconds,
        image_captcha_expire_minutes=settings.image_captcha_expire_minutes,
    )


def _bool_value(value: object, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def _int_value(value: object, fallback: int) -> int:
    return value if isinstance(value, int) else fallback


def _str_value(value: object, fallback: str) -> str:
    return str(value).strip() if isinstance(value, str) else fallback


def get_effective_email_config(db: Session | None = None) -> EmailRuntimeConfig:
    config = _settings_from_env()
    if db is None:
        return config

    row = _platform_setting(db)
    if row is None or not isinstance(row.value_json, dict):
        return config

    payload = row.value_json
    return EmailRuntimeConfig(
        email_enabled=_bool_value(payload.get("email_enabled"), config.email_enabled),
        smtp_host=_str_value(payload.get("smtp_host"), config.smtp_host),
        smtp_port=_int_value(payload.get("smtp_port"), config.smtp_port),
        smtp_use_ssl=_bool_value(payload.get("smtp_use_ssl"), config.smtp_use_ssl),
        smtp_username=_str_value(payload.get("smtp_username"), config.smtp_username),
        smtp_password=_str_value(payload.get("smtp_password"), config.smtp_password),
        smtp_from_email=_str_value(payload.get("smtp_from_email"), config.smtp_from_email),
        smtp_from_name=_str_value(payload.get("smtp_from_name"), config.smtp_from_name),
        smtp_timeout_seconds=_int_value(
            payload.get("smtp_timeout_seconds"),
            config.smtp_timeout_seconds,
        ),
        email_code_expire_minutes=_int_value(
            payload.get("email_code_expire_minutes"),
            config.email_code_expire_minutes,
        ),
        email_code_resend_seconds=_int_value(
            payload.get("email_code_resend_seconds"),
            config.email_code_resend_seconds,
        ),
        image_captcha_expire_minutes=_int_value(
            payload.get("image_captcha_expire_minutes"),
            config.image_captcha_expire_minutes,
        ),
    )


def get_email_settings(db: Session) -> EmailSettingsSummary:
    config = get_effective_email_config(db)
    return EmailSettingsSummary(
        email_enabled=config.email_enabled,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_use_ssl=config.smtp_use_ssl,
        smtp_username=config.smtp_username,
        smtp_password_configured=bool(config.smtp_password),
        smtp_from_email=config.smtp_from_email,
        smtp_from_name=config.smtp_from_name,
        smtp_timeout_seconds=config.smtp_timeout_seconds,
        email_code_expire_minutes=config.email_code_expire_minutes,
        email_code_resend_seconds=config.email_code_resend_seconds,
        image_captcha_expire_minutes=config.image_captcha_expire_minutes,
    )


def update_email_settings(
    db: Session,
    request: EmailSettingsUpdateRequest,
) -> EmailSettingsSummary:
    current = get_effective_email_config(db)
    smtp_password = current.smtp_password
    if request.clear_smtp_password:
        smtp_password = ""
    elif request.smtp_password is not None:
        smtp_password = request.smtp_password.strip()

    payload = {
        "email_enabled": request.email_enabled,
        "smtp_host": request.smtp_host.strip(),
        "smtp_port": request.smtp_port,
        "smtp_use_ssl": request.smtp_use_ssl,
        "smtp_username": request.smtp_username.strip(),
        "smtp_password": smtp_password,
        "smtp_from_email": request.smtp_from_email.strip(),
        "smtp_from_name": request.smtp_from_name.strip(),
        "smtp_timeout_seconds": request.smtp_timeout_seconds,
        "email_code_expire_minutes": request.email_code_expire_minutes,
        "email_code_resend_seconds": request.email_code_resend_seconds,
        "image_captcha_expire_minutes": request.image_captcha_expire_minutes,
    }

    row = _platform_setting(db)
    if row is None:
        row = PlatformSetting(key=EMAIL_PLATFORM_SETTING_KEY, value_json=payload)
        db.add(row)
    else:
        row.value_json = payload

    db.commit()
    return get_email_settings(db)
