"""bootstrap schema placeholder

Revision ID: 20260403_0001
Revises:
Create Date: 2026-04-03 20:05:00
"""

from alembic import op

revision = "20260403_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SELECT 1")


def downgrade() -> None:
    op.execute("SELECT 1")
