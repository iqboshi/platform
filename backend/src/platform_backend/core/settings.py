from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PLATFORM_", extra="ignore")

    app_name: str = "Platform RS Studio"
    env: str = "development"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me-for-platform-rs-studio-2026"
    access_token_expire_minutes: int = 1440
    database_url: str = "sqlite:///./data/platform.db"
    redis_url: str = "redis://localhost:6379/0"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "platform-dev"
    s3_region: str = "us-east-1"
    tile_base_url: str = "http://localhost:8000/tiles"
    storage_root: str = "./data/storage"
    allow_sqlite_fallback: bool = True
    sqlite_busy_timeout_ms: int = 30_000
    http_proxy: str = ""
    https_proxy: str = ""
    all_proxy: str = ""
    gee_enabled: bool = False
    gee_service_account_json: str = ""
    gee_project: str = ""
    gee_request_timeout_seconds: int = 20
    gee_max_retries: int = 1
    gee_download_max_pixels: int = 100_000_000
    gee_download_max_estimated_mb: int = 2048
    gee_single_request_max_bytes: int = 48 * 1024 * 1024
    email_enabled: bool = False
    smtp_host: str = "smtp.qq.com"
    smtp_port: int = 465
    smtp_use_ssl: bool = True
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Platform RS Studio"
    smtp_timeout_seconds: int = 20
    email_code_expire_minutes: int = 10
    email_code_resend_seconds: int = 60
    image_captcha_expire_minutes: int = 5
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
