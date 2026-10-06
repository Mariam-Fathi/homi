"""analytics events and notification kind

Adds the events table defined by docs/tracking-plan.md, and a kind on notifications
so analytics can tell welcome, recommendation and viewing-status notifications apart.


Revision ID: 364ad607ffb3
Revises: 62e387319b02
Create Date: 2026-10-05 13:12:50.238817

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "364ad607ffb3"
down_revision: str | Sequence[str] | None = "62e387319b02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "events",
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("event_name", sa.String(length=64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("clock_adjusted", sa.Boolean(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("anonymous_id", sa.UUID(), nullable=True),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("platform", sa.String(length=10), nullable=False),
        sa.Column("app_version", sa.String(length=32), nullable=False),
        sa.Column("properties", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id"),
    )
    op.create_index("ix_events_anonymous", "events", ["anonymous_id"], unique=False)
    op.create_index(
        "ix_events_name_occurred", "events", ["event_name", "occurred_at"], unique=False
    )
    op.create_index("ix_events_session", "events", ["session_id"], unique=False)
    op.create_index("ix_events_user_occurred", "events", ["user_id", "occurred_at"], unique=False)

    # Existing notifications get a kind derived from what they already say, then the
    # column becomes required.
    notification_kind = postgresql.ENUM(
        "welcome", "recommendation", "viewing_status", name="notification_kind"
    )
    notification_kind.create(op.get_bind())
    op.add_column("notifications", sa.Column("kind", notification_kind, nullable=True))
    op.execute("""
        UPDATE notifications SET kind = CASE
            WHEN title LIKE '%Welcome to Homi%' THEN 'welcome'::notification_kind
            WHEN title LIKE '%New Property You Might Like%' THEN 'recommendation'::notification_kind
            ELSE 'viewing_status'::notification_kind
        END
    """)
    op.alter_column("notifications", "kind", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("notifications", "kind")
    op.drop_index("ix_events_user_occurred", table_name="events")
    op.drop_index("ix_events_session", table_name="events")
    op.drop_index("ix_events_name_occurred", table_name="events")
    op.drop_index("ix_events_anonymous", table_name="events")
    op.drop_table("events")
    op.execute("DROP TYPE IF EXISTS notification_kind")
