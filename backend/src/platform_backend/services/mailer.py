from __future__ import annotations

import smtplib
import socket
from email.message import EmailMessage

from platform_backend.core.settings import get_settings
from platform_backend.services.email_settings import EmailRuntimeConfig


def _smtp_local_hostname() -> str:
    try:
        candidate = socket.getfqdn().strip()
    except OSError:
        candidate = ""

    if candidate:
        try:
            candidate.encode("ascii")
            return candidate
        except UnicodeEncodeError:
            pass
    return "localhost"


def send_text_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    config: EmailRuntimeConfig | None = None,
) -> None:
    settings = get_settings()
    runtime_config = config or EmailRuntimeConfig(
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
    from_email = runtime_config.smtp_from_email or runtime_config.smtp_username

    if not from_email or not runtime_config.smtp_username or not runtime_config.smtp_password:
        raise RuntimeError("SMTP credentials are not configured.")

    message = EmailMessage()
    message["From"] = (
        f"{runtime_config.smtp_from_name} <{from_email}>"
        if runtime_config.smtp_from_name
        else from_email
    )
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    if runtime_config.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            runtime_config.smtp_host,
            runtime_config.smtp_port,
            timeout=runtime_config.smtp_timeout_seconds,
            local_hostname=_smtp_local_hostname(),
        ) as smtp:
            smtp.login(runtime_config.smtp_username, runtime_config.smtp_password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(
        runtime_config.smtp_host,
        runtime_config.smtp_port,
        timeout=runtime_config.smtp_timeout_seconds,
        local_hostname=_smtp_local_hostname(),
    ) as smtp:
        smtp.starttls()
        smtp.login(runtime_config.smtp_username, runtime_config.smtp_password)
        smtp.send_message(message)
