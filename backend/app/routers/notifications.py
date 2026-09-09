"""Notifications Router for MediTrack+ (Phase 6).

Provides endpoints for medication reminder alerts and status management:
- List caller's notifications with unread counts
- Retrieve specific notification by ID
- Mark notification as read
- Create notification record
- Enforces strict patient data isolation and safe 404 behavior
- Embeds authoritative medical safety disclaimers
"""

import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
import pymongo

from app.core.dependencies import get_current_patient
from app.db.mongodb import get_notifications_collection
from app.models.collections import create_notification_document, now_utc
from app.schemas.notification import (
    NotificationCreate,
    NotificationListResponse,
    NotificationResponse,
    NotificationStatus,
)
from app.utils.mongo import document_to_dict, is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.notifications")
router = APIRouter(tags=["Notifications"])


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    notification_in: NotificationCreate,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Create a new notification record for the authenticated patient.
    """
    user_oid = to_object_id(current_user["id"])

    caregiver_oid = (
        to_object_id(notification_in.caregiverId)
        if notification_in.caregiverId and is_valid_object_id(notification_in.caregiverId)
        else None
    )
    medicine_oid = (
        to_object_id(notification_in.medicineId)
        if notification_in.medicineId and is_valid_object_id(notification_in.medicineId)
        else None
    )
    schedule_oid = (
        to_object_id(notification_in.scheduleId)
        if notification_in.scheduleId and is_valid_object_id(notification_in.scheduleId)
        else None
    )

    doc = create_notification_document(
        user_id=user_oid,
        notification_type=notification_in.type.value,
        title=notification_in.title,
        message=notification_in.message,
        caregiver_id=caregiver_oid,
        medicine_id=medicine_oid,
        schedule_id=schedule_oid,
        scheduled_time=notification_in.scheduledTime,
        status="unread",
    )

    notif_coll = get_notifications_collection()
    result = await notif_coll.insert_one(doc)
    doc["_id"] = result.inserted_id

    logger.info("Notification %s created for user %s", doc["_id"], user_oid)
    return document_to_dict(doc)


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    status_filter: Optional[NotificationStatus] = Query(None, alias="status", description="Filter by read/unread status"),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    List notifications belonging to the authenticated patient.

    - Scoped strictly to caller's userId.
    - Chronologically sorted by creation date (newest first).
    - Computes total unread count.
    """
    user_oid = to_object_id(current_user["id"])
    query: Dict[str, Any] = {"userId": user_oid}

    if status_filter:
        query["status"] = status_filter.value

    notif_coll = get_notifications_collection()
    cursor = notif_coll.find(query).sort("createdAt", pymongo.DESCENDING)

    items = []
    async for doc in cursor:
        items.append(document_to_dict(doc))

    unread_count = await notif_coll.count_documents({"userId": user_oid, "status": "unread"})

    return {
        "items": items,
        "total": len(items),
        "unreadCount": unread_count,
    }


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Retrieve details of a specific notification by ID.

    - Verifies patient ownership.
    - Safe 404 for unauthorized or non-existent notification.
    """
    if not is_valid_object_id(notification_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    user_oid = to_object_id(current_user["id"])
    notif_oid = to_object_id(notification_id)
    notif_coll = get_notifications_collection()

    doc = await notif_coll.find_one({"_id": notif_oid, "userId": user_oid})
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    return document_to_dict(doc)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Mark a notification as read.

    - Verifies patient ownership.
    - Updates status to 'read' and refreshes 'updatedAt'.
    - Safe 404 for unauthorized or non-existent notification.
    """
    if not is_valid_object_id(notification_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    user_oid = to_object_id(current_user["id"])
    notif_oid = to_object_id(notification_id)
    notif_coll = get_notifications_collection()

    updated_doc = await notif_coll.find_one_and_update(
        {"_id": notif_oid, "userId": user_oid},
        {"$set": {"status": "read", "updatedAt": now_utc()}},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    if updated_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    logger.info("Notification %s marked as read by user %s", notification_id, user_oid)
    return document_to_dict(updated_doc)
