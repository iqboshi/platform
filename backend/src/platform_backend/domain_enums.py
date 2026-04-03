from enum import StrEnum


class RoleKey(StrEnum):
    ADMIN = "ADMIN"
    ML_ENGINEER = "ML_ENGINEER"
    MEMBER = "MEMBER"


class ApprovalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LocaleCode(StrEnum):
    ZH_CN = "zh-CN"
    EN_US = "en-US"


class DatasetKind(StrEnum):
    RASTER = "raster"
    VECTOR = "vector"
    TABLE = "table"
    ARTIFACT = "artifact"


class DatasetStatus(StrEnum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class WorkflowRunStatus(StrEnum):
    DRAFT = "draft"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
