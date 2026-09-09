"""Health and service diagnostic routes."""

from fastapi import APIRouter
from app.core.config import settings
from app.db.mongodb import db_manager
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health & Status"])


@router.get("/health", response_model=HealthResponse)
async def check_health():
    """Verify backend and database operational status."""
    db_connected = False
    if db_manager.client is not None:
        try:
            await db_manager.client.admin.command("ping")
            db_connected = True
        except Exception:
            db_connected = False

    status = "healthy" if db_connected else "degraded"
    return HealthResponse(
        status=status,
        environment=settings.ENVIRONMENT,
        version=settings.VERSION,
        database_connected=db_connected,
        medical_disclaimer=settings.MEDICAL_DISCLAIMER
    )


@router.get("/")
async def root_info():
    """Root metadata endpoint."""
    return {
        "title": settings.PROJECT_TITLE,
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "medical_disclaimer": settings.MEDICAL_DISCLAIMER
    }
