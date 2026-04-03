from __future__ import annotations

import hashlib
import secrets
from pathlib import Path

from sqlalchemy import select

from platform_backend.core.settings import get_settings
from platform_backend.db.base import Base
from platform_backend.db.session import get_engine, get_session_factory
from platform_backend.domain_enums import ApprovalStatus, LocaleCode, RoleKey
from platform_backend.models.entities import (
    Model,
    ModelVersion,
    Role,
    User,
    Workflow,
    WorkflowVersion,
    Workspace,
    WorkspaceMembership,
)


def _ensure_sqlite_parent_dir() -> None:
    database_url = get_settings().database_url
    if not database_url.startswith("sqlite:///"):
        return

    database_path = Path(database_url.removeprefix("sqlite:///"))
    database_path.parent.mkdir(parents=True, exist_ok=True)


def _ensure_storage_root() -> Path:
    storage_root = Path(get_settings().storage_root)
    storage_root.mkdir(parents=True, exist_ok=True)
    return storage_root


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()


def _create_user(
    *,
    email: str,
    display_name: str,
    password: str,
    role_key: RoleKey,
    approval_status: ApprovalStatus,
    preferred_locale: LocaleCode,
) -> User:
    salt = secrets.token_hex(16)
    return User(
        email=email.lower(),
        display_name=display_name,
        password_salt=salt,
        password_hash=_hash_password(password, salt),
        role_key=role_key,
        approval_status=approval_status,
        preferred_locale=preferred_locale,
        is_active=True,
    )


def _default_workflow_graph() -> dict[str, object]:
    return {
        "nodes": [
            {
                "id": "node-source",
                "type": "source.dataset",
                "position": {"x": 0.0, "y": 80.0},
                "params": {},
                "input_bindings": {},
                "output_defs": [{"key": "image", "label": "Image"}],
            },
            {
                "id": "node-preprocess",
                "type": "preprocess.cog",
                "position": {"x": 280.0, "y": 80.0},
                "params": {"normalize": True},
                "input_bindings": {"image": "node-source:image"},
                "output_defs": [{"key": "prepared", "label": "Prepared Raster"}],
            },
            {
                "id": "node-split",
                "type": "split.grid",
                "position": {"x": 560.0, "y": 80.0},
                "params": {"tileSize": 512, "overlap": 64},
                "input_bindings": {"raster": "node-preprocess:prepared"},
                "output_defs": [{"key": "tiles", "label": "Tiles"}],
            },
            {
                "id": "node-inference",
                "type": "inference.segmentation",
                "position": {"x": 840.0, "y": 80.0},
                "params": {"modelVersionId": "seed-model-version"},
                "input_bindings": {"tiles": "node-split:tiles"},
                "output_defs": [{"key": "predictions", "label": "Predictions"}],
            },
            {
                "id": "node-export",
                "type": "postprocess.export",
                "position": {"x": 1120.0, "y": 80.0},
                "params": {"format": "GeoJSON"},
                "input_bindings": {"artifact": "node-inference:predictions"},
                "output_defs": [{"key": "package", "label": "Package"}],
            },
        ],
        "edges": [
            {"id": "edge-1", "source": "node-source", "target": "node-preprocess"},
            {"id": "edge-2", "source": "node-preprocess", "target": "node-split"},
            {"id": "edge-3", "source": "node-split", "target": "node-inference"},
            {"id": "edge-4", "source": "node-inference", "target": "node-export"},
        ],
    }


def init_platform() -> None:
    _ensure_sqlite_parent_dir()
    _ensure_storage_root()
    Base.metadata.create_all(bind=get_engine())

    session_factory = get_session_factory()
    with session_factory() as session:
        existing_workspace = session.scalar(select(Workspace).limit(1))
        if existing_workspace is not None:
            return

        roles = [
            Role(key=RoleKey.ADMIN, name="Administrator", description="Full platform control."),
            Role(
                key=RoleKey.ML_ENGINEER,
                name="ML Engineer",
                description="Workflow and model management.",
            ),
            Role(key=RoleKey.MEMBER, name="Member", description="Standard workspace member."),
        ]
        session.add_all(roles)

        workspace = Workspace(
            name="Earth Observation Lab",
            slug="earth-observation-lab",
            description=(
                "Remote sensing datasets, workflows, and model operations "
                "for the core team."
            ),
        )
        session.add(workspace)
        session.flush()

        users = [
            _create_user(
                email="admin@platform.local",
                display_name="Platform Admin",
                password="Admin123!",
                role_key=RoleKey.ADMIN,
                approval_status=ApprovalStatus.APPROVED,
                preferred_locale=LocaleCode.ZH_CN,
            ),
            _create_user(
                email="engineer@platform.local",
                display_name="ML Engineer",
                password="Engineer123!",
                role_key=RoleKey.ML_ENGINEER,
                approval_status=ApprovalStatus.APPROVED,
                preferred_locale=LocaleCode.EN_US,
            ),
            _create_user(
                email="member@platform.local",
                display_name="Team Member",
                password="Member123!",
                role_key=RoleKey.MEMBER,
                approval_status=ApprovalStatus.APPROVED,
                preferred_locale=LocaleCode.ZH_CN,
            ),
            _create_user(
                email="pending@platform.local",
                display_name="Pending Reviewer",
                password="Pending123!",
                role_key=RoleKey.MEMBER,
                approval_status=ApprovalStatus.PENDING,
                preferred_locale=LocaleCode.ZH_CN,
            ),
        ]
        session.add_all(users)
        session.flush()

        session.add_all(
            [
                WorkspaceMembership(
                    workspace_id=workspace.id,
                    user_id=user.id,
                    role_key=user.role_key,
                )
                for user in users
            ]
        )

        model = Model(
            workspace_id=workspace.id,
            name="Field Segmentation UNet",
            task_type="segmentation",
            description="Seeded segmentation model used for workflow smoke tests.",
        )
        session.add(model)
        session.flush()

        model_version = ModelVersion(
            id="seed-model-version",
            model_id=model.id,
            version="1.0.0",
            framework="PyTorch",
            task_type="segmentation",
            weights_path="storage://models/field-segmentation-unet/1.0.0/weights.pt",
            metadata_json={"seeded": True},
        )
        session.add(model_version)

        workflow = Workflow(
            workspace_id=workspace.id,
            name="Segmentation Pipeline",
            description="Seeded workflow template for dataset preprocessing and inference.",
        )
        session.add(workflow)
        session.flush()

        session.add(
            WorkflowVersion(
                workflow_id=workflow.id,
                version=1,
                graph_json=_default_workflow_graph(),
            )
        )

        session.commit()
