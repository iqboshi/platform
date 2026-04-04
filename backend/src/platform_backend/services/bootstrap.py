from __future__ import annotations

import hashlib
import json
import secrets
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.svm import SVR
from sqlalchemy import select

from platform_backend.core.settings import get_settings
from platform_backend.db.base import Base
from platform_backend.db.session import get_engine, get_session_factory
from platform_backend.domain_enums import (
    ApprovalStatus,
    DatasetKind,
    DatasetStatus,
    LocaleCode,
    RoleKey,
)
from platform_backend.models.entities import (
    Dataset,
    DatasetVersion,
    Model,
    ModelVersion,
    Role,
    User,
    Workflow,
    WorkflowVersion,
    Workspace,
    WorkspaceMembership,
)
from platform_backend.seed_data import (
    SEED_LINEAR_MODEL_ID,
    SEED_LINEAR_MODEL_VERSION_ID,
    SEED_RANDOM_FOREST_MODEL_ID,
    SEED_RANDOM_FOREST_MODEL_VERSION_ID,
    SEED_SVM_MODEL_ID,
    SEED_SVM_MODEL_VERSION_ID,
    SEED_TABULAR_GROUND_TRUTH_DATASET_ID,
    SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID,
    SEED_TABULAR_INPUT_DATASET_ID,
    SEED_TABULAR_INPUT_DATASET_VERSION_ID,
    SEED_TABULAR_PREDICTION_DATASET_ID,
    SEED_TABULAR_PREDICTION_DATASET_VERSION_ID,
)
from platform_backend.workflows.catalog import catalog_definition
from platform_backend.workflows.tabular_runtime import (
    create_tabular_model_metadata,
    summarize_csv_file,
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


def _write_text_if_changed(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return
    path.write_text(content, encoding="utf-8")


def _ensure_dataset_seed(
    *,
    session,
    workspace: Workspace,
    dataset_id: str,
    dataset_version_id: str,
    name: str,
    kind: DatasetKind,
    description: str,
    file_name: str,
    content_type: str,
    content: str,
    projection: str | None = None,
    footprint: str | None = None,
    metadata: dict[str, object] | None = None,
) -> None:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        dataset = Dataset(
            id=dataset_id,
            workspace_id=workspace.id,
            name=name,
            kind=kind,
            status=DatasetStatus.READY,
            projection=projection,
            footprint=footprint,
            description=description,
        )
        session.add(dataset)
        session.flush()
    else:
        dataset.name = name
        dataset.kind = kind
        dataset.status = DatasetStatus.READY
        dataset.projection = projection
        dataset.footprint = footprint
        dataset.description = description

    target_dir = _ensure_storage_root() / "seed" / "datasets" / dataset_id / "v1"
    target_path = target_dir / file_name
    _write_text_if_changed(target_path, content)

    metadata_json = {
        "seeded": True,
        "visibility": "public",
        **(metadata or {}),
    }
    if kind == DatasetKind.TABLE:
        metadata_json.update(summarize_csv_file(target_path))

    version = session.get(DatasetVersion, dataset_version_id)
    if version is None:
        version = DatasetVersion(
            id=dataset_version_id,
            dataset_id=dataset.id,
            version=1,
            status=DatasetStatus.READY,
            asset_path=str(target_path.resolve()),
            preview_url=(
                f"{get_settings().api_v1_prefix}/dataset-versions/"
                f"{dataset_version_id}/download"
            ),
            original_file_name=file_name,
            content_type=content_type,
            size_bytes=target_path.stat().st_size,
            metadata_json=metadata_json,
        )
        session.add(version)
        session.flush()
    else:
        version.dataset_id = dataset.id
        version.version = 1
        version.status = DatasetStatus.READY
        version.asset_path = str(target_path.resolve())
        version.preview_url = (
            f"{get_settings().api_v1_prefix}/dataset-versions/{dataset_version_id}/download"
        )
        version.original_file_name = file_name
        version.content_type = content_type
        version.size_bytes = target_path.stat().st_size
        version.metadata_json = metadata_json


def _ensure_model_seed(
    *,
    session,
    workspace: Workspace,
    model_id: str,
    model_version_id: str,
    model_name: str,
    version: str,
    algorithm_key: str,
    framework: str,
    description: str,
    file_name: str,
    write_artifact,
    feature_names: list[str],
    default_parameters: dict[str, object],
) -> None:
    model = session.get(Model, model_id)
    if model is None:
        model = Model(
            id=model_id,
            workspace_id=workspace.id,
            name=model_name,
            task_type="regression",
            description=description,
        )
        session.add(model)
        session.flush()
    else:
        model.name = model_name
        model.task_type = "regression"
        model.description = description

    target_dir = _ensure_storage_root() / "seed" / "models" / model_id / version
    target_path = target_dir / file_name
    target_path.parent.mkdir(parents=True, exist_ok=True)
    write_artifact(target_path)

    task_type, normalized_framework, metadata_json = create_tabular_model_metadata(
        file_path=target_path,
        original_file_name=file_name,
        algorithm_key=algorithm_key,
        framework=framework,
        task_type="regression",
        feature_names=feature_names,
        default_parameters=default_parameters,
    )
    metadata_json["seeded"] = True
    metadata_json["source_type"] = "seeded"
    metadata_json["execution_mode"] = "in_process"
    metadata_json["visibility"] = "workspace"

    model_version = session.get(ModelVersion, model_version_id)
    if model_version is None:
        model_version = ModelVersion(
            id=model_version_id,
            model_id=model.id,
            version=version,
            framework=normalized_framework,
            task_type=task_type,
            weights_path=str(target_path.resolve()),
            metadata_json=metadata_json,
        )
        session.add(model_version)
    else:
        model_version.model_id = model.id
        model_version.version = version
        model_version.framework = normalized_framework
        model_version.task_type = task_type
        model_version.weights_path = str(target_path.resolve())
        model_version.metadata_json = metadata_json


_COMPACT_WORKFLOW_NODE_TYPES = {
    "source.dataset_version",
    "table.load_csv",
    "tabular.linear_regression_predict",
    "tabular.svm_regression_predict",
    "tabular.random_forest_regression_predict",
    "tabular.predict",
    "metrics.validate_regression",
    "export.table",
    "export.metrics",
}


def _ensure_seed_assets(session, workspace: Workspace) -> None:
    _ensure_dataset_seed(
        session=session,
        workspace=workspace,
        dataset_id=SEED_TABULAR_INPUT_DATASET_ID,
        dataset_version_id=SEED_TABULAR_INPUT_DATASET_VERSION_ID,
        name="Sample Tabular Input",
        kind=DatasetKind.TABLE,
        description="Seeded CSV input for prediction workflow templates.",
        file_name="sample-tabular-input.csv",
        content_type="text/csv",
        content=(
            "feature_a,feature_b,target\n"
            "1,2,2.1\n"
            "2,3,3.4\n"
            "3,4,4.7\n"
            "4,5,6.0\n"
        ),
    )
    _ensure_dataset_seed(
        session=session,
        workspace=workspace,
        dataset_id=SEED_TABULAR_PREDICTION_DATASET_ID,
        dataset_version_id=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID,
        name="Sample Prediction Output",
        kind=DatasetKind.TABLE,
        description="Seeded prediction CSV for validation workflow templates.",
        file_name="sample-prediction-output.csv",
        content_type="text/csv",
        content=(
            "feature_a,prediction\n"
            "1,2.0\n"
            "2,3.5\n"
            "3,4.9\n"
            "4,5.8\n"
        ),
    )
    _ensure_dataset_seed(
        session=session,
        workspace=workspace,
        dataset_id=SEED_TABULAR_GROUND_TRUTH_DATASET_ID,
        dataset_version_id=SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID,
        name="Sample Ground Truth",
        kind=DatasetKind.TABLE,
        description="Seeded ground-truth CSV for validation workflow templates.",
        file_name="sample-ground-truth.csv",
        content_type="text/csv",
        content=(
            "feature_a,target\n"
            "1,2.1\n"
            "2,3.4\n"
            "3,4.8\n"
            "4,5.9\n"
        ),
    )

    _ensure_model_seed(
        session=session,
        workspace=workspace,
        model_id=SEED_LINEAR_MODEL_ID,
        model_version_id=SEED_LINEAR_MODEL_VERSION_ID,
        model_name="Sample Linear Regression",
        version="1.0.0",
        algorithm_key="linear_regression",
        framework="json",
        description="Seeded linear regression model for workflow templates.",
        file_name="sample-linear-model.json",
        write_artifact=lambda target_path: _write_text_if_changed(
            target_path,
            json.dumps(
                {
                    "kind": "tabular_model",
                    "model_type": "linear_regression",
                    "task_type": "regression",
                    "features": ["feature_a", "feature_b"],
                    "intercept": 0.3,
                    "coefficients": {
                        "feature_a": 0.75,
                        "feature_b": 0.55,
                    },
                    "prediction_column": "prediction",
                    "default_parameters": {
                        "round_digits": 4,
                    },
                },
                indent=2,
            ),
        ),
        feature_names=["feature_a", "feature_b"],
        default_parameters={"roundDigits": 4},
    )
    _ensure_model_seed(
        session=session,
        workspace=workspace,
        model_id=SEED_SVM_MODEL_ID,
        model_version_id=SEED_SVM_MODEL_VERSION_ID,
        model_name="Sample SVM Regression",
        version="1.0.0",
        algorithm_key="svm_regression",
        framework="scikit-learn",
        description="Seeded SVM regression model for workflow templates.",
        file_name="sample-svm-model.joblib",
        write_artifact=lambda target_path: joblib.dump(
            SVR(kernel="linear", C=1.0, epsilon=0.1).fit(
                [[1.0, 2.0], [2.0, 3.0], [3.0, 4.0], [4.0, 5.0]],
                [2.0, 3.4, 4.8, 6.1],
            ),
            target_path,
        ),
        feature_names=["feature_a", "feature_b"],
        default_parameters={"roundDigits": 4, "cacheSize": 200},
    )
    _ensure_model_seed(
        session=session,
        workspace=workspace,
        model_id=SEED_RANDOM_FOREST_MODEL_ID,
        model_version_id=SEED_RANDOM_FOREST_MODEL_VERSION_ID,
        model_name="Sample Random Forest Regression",
        version="1.0.0",
        algorithm_key="random_forest_regression",
        framework="scikit-learn",
        description="Seeded random forest regression model for workflow templates.",
        file_name="sample-rf-model.joblib",
        write_artifact=lambda target_path: joblib.dump(
            RandomForestRegressor(n_estimators=12, max_depth=4, random_state=0).fit(
                [[1.0, 2.0], [2.0, 3.0], [3.0, 4.0], [4.0, 5.0], [5.0, 6.0]],
                [2.1, 3.4, 4.9, 6.0, 7.3],
            ),
            target_path,
        ),
        feature_names=["feature_a", "feature_b"],
        default_parameters={"roundDigits": 4, "nJobs": 1},
    )


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
    def output_defs(node_type: str) -> list[dict[str, object]]:
        return [port.model_dump(mode="json") for port in catalog_definition(node_type).outputs]

    return {
        "nodes": [
            {
                "id": "dataset-source",
                "type": "source.dataset_version",
                "position": {"x": 0.0, "y": 160.0},
                "params": {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
                "input_bindings": {},
                "output_defs": output_defs("source.dataset_version"),
            },
            {
                "id": "load-table",
                "type": "table.load_csv",
                "position": {"x": 260.0, "y": 160.0},
                "params": {"delimiter": ","},
                "input_bindings": {"dataset": "dataset-source:dataset"},
                "output_defs": output_defs("table.load_csv"),
            },
            {
                "id": "predict-table",
                "type": "tabular.linear_regression_predict",
                "position": {"x": 560.0, "y": 160.0},
                "params": {
                    "modelVersionId": SEED_LINEAR_MODEL_VERSION_ID,
                    "predictionColumn": "prediction",
                    "roundDigits": 4,
                },
                "input_bindings": {"table": "load-table:table"},
                "output_defs": output_defs("tabular.linear_regression_predict"),
            },
            {
                "id": "export-table",
                "type": "export.table",
                "position": {"x": 860.0, "y": 160.0},
                "params": {
                    "saveToPlatform": True,
                    "outputDatasetName": "Prediction Output",
                },
                "input_bindings": {"input": "predict-table:table"},
                "output_defs": output_defs("export.table"),
            },
        ],
        "edges": [
            {
                "id": "edge-1",
                "source": "dataset-source",
                "target": "load-table",
                "source_handle": "dataset",
                "target_handle": "dataset",
            },
            {
                "id": "edge-2",
                "source": "load-table",
                "target": "predict-table",
                "source_handle": "table",
                "target_handle": "table",
            },
            {
                "id": "edge-3",
                "source": "predict-table",
                "target": "export-table",
                "source_handle": "table",
                "target_handle": "input",
            },
        ],
    }


def _workflow_graph_needs_compaction(graph_json: dict[str, object]) -> bool:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list) or not nodes:
        return True

    for node in nodes:
        if not isinstance(node, dict):
            return True
        if str(node.get("type", "")).strip() not in _COMPACT_WORKFLOW_NODE_TYPES:
            return True

    return False


def init_platform() -> None:
    _ensure_sqlite_parent_dir()
    _ensure_storage_root()
    Base.metadata.create_all(bind=get_engine())

    session_factory = get_session_factory()
    with session_factory() as session:
        existing_workspace = session.scalar(select(Workspace).limit(1))
        if existing_workspace is not None:
            _ensure_seed_assets(session, existing_workspace)
            workflow = session.scalar(select(Workflow).order_by(Workflow.created_at.asc()))
            latest_version = session.scalar(
                select(WorkflowVersion).order_by(
                    WorkflowVersion.version.desc(),
                    WorkflowVersion.created_at.desc(),
                )
            )
            if workflow is None:
                workflow = Workflow(
                    workspace_id=existing_workspace.id,
                    name="CSV Prediction Pipeline",
                    description="Seeded workflow for CSV prediction and validation.",
                )
                session.add(workflow)
                session.flush()

            workflow.name = "CSV Prediction Pipeline"
            workflow.description = "Seeded workflow for CSV prediction and validation."

            if latest_version is None:
                session.add(
                    WorkflowVersion(
                        workflow_id=workflow.id,
                        version=1,
                        graph_json=_default_workflow_graph(),
                    )
                )
            elif _workflow_graph_needs_compaction(latest_version.graph_json):
                session.add(
                    WorkflowVersion(
                        workflow_id=workflow.id,
                        version=latest_version.version + 1,
                        graph_json=_default_workflow_graph(),
                    )
                )
            session.commit()
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
                "Remote sensing datasets, workflows, and model operations for the core team."
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

        workflow = Workflow(
            workspace_id=workspace.id,
            name="CSV Prediction Pipeline",
            description="Seeded workflow for CSV prediction and validation.",
        )
        session.add(workflow)
        session.flush()

        _ensure_seed_assets(session, workspace)

        session.add(
            WorkflowVersion(
                workflow_id=workflow.id,
                version=1,
                graph_json=_default_workflow_graph(),
            )
        )

        session.commit()
