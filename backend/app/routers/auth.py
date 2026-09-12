"""Authentication and User Profile REST API Endpoints."""

import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.mongodb import get_users_collection
from app.models.collections import create_user_document, now_utc
from app.schemas.user import (
    PasswordChange,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
)
from app.utils.mongo import document_to_dict, to_object_id

logger = logging.getLogger("meditrack.auth")
router = APIRouter(tags=["Authentication & Profile"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new patient or caregiver account",
)
async def register(payload: UserRegister) -> TokenResponse:
    """
    Create a new user account with secure Bcrypt password hashing,
    verify duplicate emails, and return a signed JWT access token.
    """
    email = payload.email.strip().lower()
    users_coll = get_users_collection()

    # Verify no duplicate account exists
    existing = await users_coll.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    # Securely hash password using Bcrypt
    hashed = hash_password(payload.password)

    # Construct user document
    user_doc = create_user_document(
        email=email,
        full_name=payload.fullName,
        password_hash=hashed,
        role=payload.role.value if hasattr(payload.role, "value") else str(payload.role),
        phone=payload.phone,
        emergency_contact=payload.emergencyContact,
        health_conditions=[],
    )

    await users_coll.insert_one(user_doc)
    logger.info("New user registered successfully: %s (role: %s)", email, user_doc["role"])

    user_dict = document_to_dict(user_doc)
    access_token = create_access_token(
        subject=user_dict["id"],
        role=user_dict["role"],
        email=user_dict["email"],
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user_dict),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue JWT access token",
)
async def login(payload: UserLogin) -> TokenResponse:
    """
    Validate credentials against the stored Bcrypt hash and return
    a signed JWT access token with user claims.
    """
    email = payload.email.strip().lower()
    users_coll = get_users_collection()

    user_doc = await users_coll.find_one({"email": email})
    if not user_doc or not verify_password(payload.password, user_doc.get("passwordHash", "")):
        logger.warning("Failed login attempt for: %s", email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_dict = document_to_dict(user_doc)
    access_token = create_access_token(
        subject=user_dict["id"],
        role=user_dict["role"],
        email=user_dict["email"],
    )

    logger.info("User logged in successfully: %s", email)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user_dict),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Retrieve profile for the currently authenticated user",
)
async def get_my_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> UserResponse:
    """Return the profile of the current caller without sensitive password hashes."""
    return UserResponse(**current_user)


@router.patch(
    "/profile",
    response_model=UserResponse,
    summary="Update permitted profile fields for the authenticated user",
)
async def update_profile(
    payload: UserUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> UserResponse:
    """
    Allow users to update fullName, phone, emergencyContact, healthConditions,
    and notificationPreferences.
    Protected fields (role, _id, passwordHash, createdAt) are strictly preserved.
    """
    updates: Dict[str, Any] = {}

    if payload.fullName is not None:
        stripped_name = payload.fullName.strip()
        if not stripped_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Full name cannot be empty.",
            )
        updates["fullName"] = stripped_name

    if payload.phone is not None:
        updates["phone"] = payload.phone.strip() if payload.phone else None

    if payload.emergencyContact is not None:
        updates["emergencyContact"] = payload.emergencyContact.strip() if payload.emergencyContact else None

    if payload.healthConditions is not None:
        updates["healthConditions"] = payload.healthConditions

    if payload.notificationPreferences is not None:
        existing_prefs = current_user.get("notificationPreferences") or {}
        merged_prefs = {
            "medicationRemindersEnabled": existing_prefs.get("medicationRemindersEnabled", True),
            "emailReportsEnabled": existing_prefs.get("emailReportsEnabled", False),
            "emailAlertsEnabled": existing_prefs.get("emailAlertsEnabled", False),
        }
        provided = payload.notificationPreferences.model_dump(exclude_unset=True)
        merged_prefs.update(provided)
        updates["notificationPreferences"] = merged_prefs

    if updates:
        updates["updatedAt"] = now_utc()
        users_coll = get_users_collection()
        user_oid = to_object_id(current_user["id"])
        await users_coll.update_one({"_id": user_oid}, {"$set": updates})

        updated_doc = await users_coll.find_one({"_id": user_oid})
        return UserResponse(**document_to_dict(updated_doc))

    return UserResponse(**current_user)


@router.patch(
    "/password",
    status_code=status.HTTP_200_OK,
    summary="Change password for authenticated user",
)
async def change_password(
    payload: PasswordChange,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    """
    Securely update the authenticated user's password:
    - Strictly authenticated via JWT identity.
    - Validates current password against stored bcrypt hash.
    - Returns HTTP 401 Unauthorized if current password is incorrect.
    - Hashes new password with bcrypt (12 rounds).
    - Updates passwordHash in database with updatedAt.
    - Never logs or exposes passwords or password hashes.
    """
    user_oid = to_object_id(current_user["id"])
    users_coll = get_users_collection()
    user_doc = await users_coll.find_one({"_id": user_oid})

    if not user_doc or not verify_password(payload.currentPassword, user_doc.get("passwordHash", "")):
        logger.warning("Password change rejected: incorrect current password for user %s", current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    new_hash = hash_password(payload.newPassword)
    await users_coll.update_one(
        {"_id": user_oid},
        {"$set": {"passwordHash": new_hash, "updatedAt": now_utc()}},
    )
    logger.info("Password changed successfully for user %s", current_user["id"])
    return {"message": "Password updated successfully."}
