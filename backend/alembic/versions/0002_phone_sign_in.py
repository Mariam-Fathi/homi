"""phone sign-in replaces google

Users now sign in with a name and phone number; the Google-only columns go away.


Revision ID: 92d12d797b4c
Revises: eaa52ad244a7
Create Date: 2026-10-04 15:30:27.299901

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "92d12d797b4c"
down_revision: str | Sequence[str] | None = "eaa52ad244a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=20), nullable=True))
    op.create_unique_constraint("users_phone_key", "users", ["phone"])
    op.drop_constraint("users_email_key", "users", type_="unique")
    op.drop_constraint("users_google_sub_key", "users", type_="unique")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "email")
    op.drop_column("users", "avatar_url")


def downgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    # email was required and unique; give existing rows a unique placeholder first.
    op.add_column("users", sa.Column("email", sa.String(length=320), nullable=True))
    op.execute("UPDATE users SET email = id || '@restored.invalid'")
    op.alter_column("users", "email", nullable=False)
    op.create_unique_constraint("users_email_key", "users", ["email"])
    op.create_unique_constraint("users_google_sub_key", "users", ["google_sub"])
    op.drop_constraint("users_phone_key", "users", type_="unique")
    op.drop_column("users", "phone")
