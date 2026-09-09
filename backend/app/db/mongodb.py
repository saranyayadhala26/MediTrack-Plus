"""MongoDB Atlas connection manager and collection references using PyMongo Async API."""

import asyncio
import logging
from typing import Optional
import pymongo
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.asynchronous.collection import AsyncCollection

from app.core.config import settings
from app.models.collections import (
    COLLECTION_USERS,
    COLLECTION_MEDICINES,
    COLLECTION_SCHEDULES,
    COLLECTION_ACTIVITIES,
    COLLECTION_CAREGIVERS,
    COLLECTION_NOTIFICATIONS,
)

logger = logging.getLogger("meditrack.db")


class MongoDB:
    client: Optional[AsyncMongoClient] = None
    db: Optional[AsyncDatabase] = None


db_manager = MongoDB()


async def connect_to_mongo():
    """Initialize MongoDB Atlas connection using official PyMongo Async client and ensure indexes."""
    logger.info("Connecting to MongoDB Atlas at: %s", settings.MONGODB_URI.split("@")[-1])
    try:
        db_manager.client = AsyncMongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000
        )
        db_manager.db = db_manager.client[settings.DATABASE_NAME]

        # Verify Atlas connection with ping
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
    """Close MongoDB Atlas async connection pool."""
    if db_manager.client:
        logger.info("Closing MongoDB connection pool...")
        await db_manager.client.close()
        logger.info("MongoDB connection closed.")


async def setup_indexes():
    """Configure required indexes across all collections using PyMongo Async API."""
    if db_manager.db is None:
        return

    try:
        # Users indexes: unique email
        await db_manager.db[COLLECTION_USERS].create_index(
            [("email", pymongo.ASCENDING)],
            unique=True
        )

        # Medicines indexes: query by userId, search by name, compound index
        await db_manager.db[COLLECTION_MEDICINES].create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_MEDICINES].create_index([("name", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_MEDICINES].create_index([
            ("userId", pymongo.ASCENDING),
            ("name", pymongo.ASCENDING)
        ])

        # Medication Schedules indexes: user schedules, medicine schedules, active schedules
        await db_manager.db[COLLECTION_SCHEDULES].create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_SCHEDULES].create_index([("medicineId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_SCHEDULES].create_index([
            ("userId", pymongo.ASCENDING),
            ("enabled", pymongo.ASCENDING)
        ])

        # Medication Activities indexes: date queries, streak lookups, history
        await db_manager.db[COLLECTION_ACTIVITIES].create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_ACTIVITIES].create_index([("scheduledDate", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_ACTIVITIES].create_index([("medicineId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_ACTIVITIES].create_index([
            ("userId", pymongo.ASCENDING),
            ("scheduledDate", pymongo.ASCENDING),
            ("scheduleId", pymongo.ASCENDING),
            ("scheduledTime", pymongo.ASCENDING),
        ])

        # Caregivers indexes: patient's caregivers, unique relationship per email
        await db_manager.db[COLLECTION_CAREGIVERS].create_index([("patientId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_CAREGIVERS].create_index([("caregiverEmail", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_CAREGIVERS].create_index(
            [("patientId", pymongo.ASCENDING), ("caregiverEmail", pymongo.ASCENDING)],
            unique=True
        )

        # Notifications indexes: user unread alerts, chronological order
        await db_manager.db[COLLECTION_NOTIFICATIONS].create_index([("userId", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_NOTIFICATIONS].create_index([("status", pymongo.ASCENDING)])
        await db_manager.db[COLLECTION_NOTIFICATIONS].create_index([
            ("userId", pymongo.ASCENDING),
            ("status", pymongo.ASCENDING)
        ])
        await db_manager.db[COLLECTION_NOTIFICATIONS].create_index([("createdAt", pymongo.DESCENDING)])

        logger.info("MongoDB indexes verified successfully with PyMongo Async API.")
    except Exception as e:
        logger.warning("Error creating MongoDB indexes: %s", str(e))


def get_database() -> AsyncDatabase:
    """Return current active database reference, ensuring client is bound to the running event loop."""
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if db_manager.client is None or (
        current_loop is not None and getattr(db_manager.client, "_loop", None) != current_loop
    ):
        db_manager.client = AsyncMongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000
        )
        db_manager.db = db_manager.client[settings.DATABASE_NAME]

    return db_manager.db


# Collection accessors
def get_users_collection() -> AsyncCollection:
    return get_database()[COLLECTION_USERS]


def get_medicines_collection() -> AsyncCollection:
    return get_database()[COLLECTION_MEDICINES]


def get_schedules_collection() -> AsyncCollection:
    return get_database()[COLLECTION_SCHEDULES]


def get_activities_collection() -> AsyncCollection:
    return get_database()[COLLECTION_ACTIVITIES]


def get_caregivers_collection() -> AsyncCollection:
    return get_database()[COLLECTION_CAREGIVERS]


def get_notifications_collection() -> AsyncCollection:
    return get_database()[COLLECTION_NOTIFICATIONS]
