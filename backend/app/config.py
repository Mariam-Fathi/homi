from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://homi:homi@localhost:5433/homi"

    # Signing key for access tokens. Must be overridden outside local development.
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24 * 7

    # Lets reviewers try the app without signing up: each call creates a fresh
    # guest user. Disable it if the API is ever used for real users.
    demo_login_enabled: bool = True

    # NoDecode: read the raw string (comma-separated) instead of expecting JSON.
    cors_origins: Annotated[list[str], NoDecode] = ["*"]

    environment: str = "development"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        # Allow comma-separated values in environment variables.
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment != "development" and settings.jwt_secret == "dev-only-change-me":
        raise RuntimeError("JWT_SECRET must be set outside development")
    return settings
