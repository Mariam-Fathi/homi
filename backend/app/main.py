from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.db import engine
from app.routers import auth, events, favorites, notifications, properties, users, viewings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Homi API",
        version="0.1.0",
        description="Backend for the Homi real-estate app.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (
        auth.router,
        users.router,
        properties.router,
        favorites.router,
        notifications.router,
        viewings.router,
        events.router,
    ):
        app.include_router(router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
