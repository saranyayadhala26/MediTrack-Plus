"""MongoDB Atlas connection manager and collection references."""

import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import pymongo

from app.core.config import settings

logger = logging.getLogger("meditrack.db")


class MongoDB:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None


db_manager = MongoDB()


async def connect_to_mongo():
    """Initialize MongoDB connection and ensure database indexes."""
    logger.info("Connecting to MongoDB at: %s", settings.MONGODB_URI.split("@")[-1])
    try:
        db_manager.client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000
        )
        db_manager.db = db_manager.client[settings.DATABASE_NAME]

        # Verify connection
        await db_manager.client.admin.command("ping")
        logger.info("Successfully connected to MongoDB Atlas database '%s'", settings.DATABASE_NAME)

        # Setup collection indexes
        await setup_indexes()
    except Exception as e:
        logger.warning(
            "Could not connect to MongoDB during startup (%s). App will continue in fallback mode.",
            str(e)
        )


async def close_mongo_connection():
    """Close MongoDB connection pool."""
    if db_manager.client:
        logger.info("Closing MongoDB connection pool...")
        db_manager.client.close()
        logger.info("MongoDB connection closed.")


async def setup_indexes():
    """Configure required indexes across all collections."""
    if db_manager.db is None:
        return

    try:
        # Users indexes
        await db_manager.db.users.create_index([("email", pymongo.ASCENDING)], unique=True)

        # Medicines indexes
        await db_manager.db.medicines.create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db.medicines.create_index([("name", pymongo.ASCENDING)])

        # Medication Schedules indexes
        await db_manager.db.medication_schedules.create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db.medication_schedules.create_index([("medicineId", pymongo.ASCENDING)])

        # Medication Activities indexes
        await db_manager.db.medication_activities.create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db.medication_activities.create_index([("scheduledDate", pymongo.ASCENDING)])
        await db_manager.db.medication_activities.create_index([("medicineId", pymongo.ASCENDING)])
        await db_manager.db.medication_activities.create_index([
            ("userId", pymongo.ASCENDING),
            ("scheduledDate", pymongo.ASCENDING),
            ("scheduleId", pymongo.ASCENDING)
        ])

        # Caregivers indexes
        await db_manager.db.caregivers.create_index([("patientId", pymongo.ASCENDING)])
        await db_manager.db.caregivers.create_index([("caregiverEmail", pymongo.ASCENDING)])

        # Notifications indexes
        await db_manager.db.notifications.create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db.notifications.create_index([("status", pymongo.ASCENDING)])

        logger.info("MongoDB indexes verified successfully.")
    except Exception as e:
        logger.warning("Error creating MongoDB indexes: %s", str(e))


def get_database() -> AsyncIOMotorDatabase:
    """Return current active database reference."""
    if db_manager.db is None:
        raise RuntimeError("Database connection has not been initialized.")
    return db_manager.db


# Collection accessors
def get_users_collection():
    return get_database()["users"]


def get_medicines_collection():
    return get_database()["medicines"]


def get_schedules_collection():
    return get_database()["medication_schedules"]


def get_activities_collection():
    return get_database()["medication_activities"]


def get_caregivers_collection():
    return get_database()["caregivers"]


def get_notifications_collection():
    return get_database()["notifications"]
