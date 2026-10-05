import os
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta

import pytest

# Must be set before app modules create their engine.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://homi:homi@localhost:5433/homi_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Agent, Property, User, UserRole  # noqa: E402
from app.security import create_access_token  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    """Builds the schema through the real migrations, so they are tested too."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    command.upgrade(Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini")), "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    counter = iter(range(1, 10_000))

    def _make(role: UserRole = UserRole.USER, **fields: object) -> User:
        n = next(counter)
        fields.setdefault("name", f"User {n}")
        user = User(phone=f"+2010{n:08d}", role=role, **fields)
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def auth_headers() -> Callable[[User], dict[str, str]]:
    def _headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, get_settings())}"}

    return _headers


@pytest.fixture
def make_property(db: Session) -> Callable[..., Property]:
    counter = iter(range(1, 10_000))

    def _make(age_days: float = 1, **fields: object) -> Property:
        n = next(counter)
        values: dict[str, object] = {
            "name": f"Property {n}",
            "type": "Apartments",
            "address": f"{n} Nile St, Maadi, Cairo",
            "price": 5_000_000,
            "area": 1500,
            "bedrooms": 3,
            "bathrooms": 2,
            "rating": 4.5,
            "image_url": "https://example.com/p.jpg",
            "facilities": ["Gym"],
            "created_at": datetime.now(UTC) - timedelta(days=age_days),
        }
        values.update(fields)
        prop = Property(**values)
        if "agent" not in fields:
            prop.agent = Agent(name="Agent", email="agent@homi.app")
        db.add(prop)
        db.commit()
        return prop

    return _make
