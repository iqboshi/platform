from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import ModelSummary, ModelVersionSummary
from platform_backend.services.platform_store import (
    create_model_upload,
    list_model_versions,
    list_models,
)
from platform_backend.workflows.tabular_runtime import parse_json_object

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[ModelSummary],
    dependencies=[Depends(require_permission("model.view"))],
)
def list_models_route(db: DatabaseDep) -> list[ModelSummary]:
    return list_models(db)


@router.get(
    "/versions",
    response_model=list[ModelVersionSummary],
    dependencies=[Depends(require_permission("model.view"))],
)
def list_model_versions_route(db: DatabaseDep) -> list[ModelVersionSummary]:
    return list_model_versions(db)


@router.post(
    "/upload",
    response_model=ModelVersionSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("model.manage"))],
)
def upload_model_route(
    db: DatabaseDep,
    workspace_id: Annotated[str, Form(...)],
    model_name: Annotated[str, Form(...)],
    version: Annotated[str, Form(...)],
    algorithm_key: Annotated[str, Form(...)],
    task_type: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
    framework: Annotated[str, Form()] = "",
    feature_names_json: Annotated[str, Form()] = "[]",
    default_parameters_json: Annotated[str, Form()] = "{}",
) -> ModelVersionSummary:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    try:
        feature_names_payload = json.loads(feature_names_json)
        if not isinstance(feature_names_payload, list) or not all(
            isinstance(item, str) for item in feature_names_payload
        ):
            raise ValueError("feature_names_json must be a JSON array of strings.")
        return create_model_upload(
            db,
            workspace_id=workspace_id,
            model_name=model_name,
            version=version,
            algorithm_key=algorithm_key,
            task_type=task_type,
            framework=framework,
            feature_names=[item.strip() for item in feature_names_payload if item.strip()],
            default_parameters=parse_json_object(
                default_parameters_json,
                field_name="default_parameters_json",
            ),
            upload_file=file.file,
            original_file_name=file.filename,
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
