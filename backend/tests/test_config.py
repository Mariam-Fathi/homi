import pytest

from app.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", []),
        ("https://a.app", ["https://a.app"]),
        ("https://a.app, https://b.app,", ["https://a.app", "https://b.app"]),
    ],
)
def test_list_settings_accept_comma_separated_env_values(monkeypatch, raw, expected):
    # Regression: an empty or comma-separated value used to crash startup because
    # pydantic-settings tried to parse it as JSON.
    monkeypatch.setenv("CORS_ORIGINS", raw)
    assert Settings().cors_origins == expected


def test_default_jwt_secret_is_rejected_outside_development(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "dev-only-change-me")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            get_settings()
    finally:
        get_settings.cache_clear()
