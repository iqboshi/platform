from __future__ import annotations

from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from platform_backend.core.settings import get_settings


@lru_cache(maxsize=1)
def get_engine():
    settings = get_settings()
    database_url = settings.database_url
    if database_url.startswith("sqlite"):
        connect_args = {
            "check_same_thread": False,
            "timeout": max(settings.sqlite_busy_timeout_ms / 1000, 1),
        }
        engine = create_engine(
            database_url,
            pool_pre_ping=True,
            future=True,
            connect_args=connect_args,
            poolclass=NullPool,
        )

        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, _record) -> None:
            cursor = connection.cursor()
            cursor.execute(f"PRAGMA busy_timeout = {settings.sqlite_busy_timeout_ms}")
            try:
                cursor.execute("PRAGMA journal_mode = WAL")
                cursor.execute("PRAGMA synchronous = NORMAL")
            except Exception:
                pass
            cursor.close()

        return engine

    return create_engine(database_url, pool_pre_ping=True, future=True)


def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
