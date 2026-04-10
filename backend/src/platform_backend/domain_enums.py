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


class FeedbackTicketCategory(StrEnum):
    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    UX = "ux"
    QUESTION = "question"
    OTHER = "other"


class FeedbackTicketPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FeedbackTicketStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class EmailVerificationScene(StrEnum):
    REGISTER = "register"
    CHANGE_EMAIL = "change_email"


class RoleUpgradeRequestStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
