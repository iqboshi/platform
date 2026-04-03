from __future__ import annotations

from celery import Celery

from platform_backend.core.settings import get_settings

settings = get_settings()

celery_app = Celery(
    "platform_backend",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.task_default_queue = "platform-default"
