"""FastAPI Main Application Entry Point for MediTrack+."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.mongodb import connect_to_mongo, close_mongo_connection
from app.routers import activities, auth, health, medicines, notifications, schedules

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("meditrack.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown event lifecycle manager."""
    logger.info("Initializing MediTrack+ Backend API service...")
    await connect_to_mongo()
    yield
    logger.info("Shutting down MediTrack+ Backend API service...")
    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_TITLE,
    version=settings.VERSION,
    description=(
        "MediTrack+ Smart Medication Management & Adherence Platform REST API.\n\n"
        "**Medical Safety Disclaimer**: MediTrack+ is a medication reminder and adherence "
        "tracking platform. It does NOT diagnose diseases, prescribe medication, or provide "
        "medical advice."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS Configuration
origins = settings.CORS_ORIGINS
if origins == ["*"] or "*" in origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include Routers
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(health.router)  # Also expose /health at root for cloud health checkers
app.include_router(auth.router, prefix=f"{settings.API_V1_PREFIX}/auth")
app.include_router(medicines.router, prefix=f"{settings.API_V1_PREFIX}/medicines")
app.include_router(schedules.router, prefix=f"{settings.API_V1_PREFIX}/schedules")
app.include_router(notifications.router, prefix=f"{settings.API_V1_PREFIX}/notifications")
app.include_router(activities.router, prefix=f"{settings.API_V1_PREFIX}/medication-activities")
