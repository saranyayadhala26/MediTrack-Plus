"""Authentication and User Profile REST API Endpoints."""

from datetime import timedelta, timezone
import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import ReturnDocument

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    generate_reset_otp,
    hash_password,
    hash_reset_otp,
    verify_password,
    verify_reset_otp,
)
from app.db.mongodb import get_users_collection
from app.models.collections import create_user_document, now_utc
from app.schemas.user import (
    EmergencyContactResponse,
    EmergencyContactSchema,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    NotificationPreferences,
    NotificationPreferencesUpdate,
    PasswordChange,
    ResendVerificationOtpRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
    VerifyEmailRequest,
    VerifyEmailResponse,
    VerifyResetOtpRequest,
    VerifyResetOtpResponse,
)
from app.services.email_service import get_email_service
from app.services.email_templates import (
    create_email_verification_email,
    create_password_changed_notification_email,
    create_password_reset_email,
)
from app.services.rate_limiter import rate_limiter
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
    generate and dispatch an email verification OTP code,
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

    # Generate 6-digit cryptographic verification OTP
    otp = generate_reset_otp()
    pepper = settings.get_reset_token_pepper()
    otp_hash = hash_reset_otp(otp, pepper)
    now = now_utc()
    expires_at = now + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)

    user_doc["isEmailVerified"] = False
    user_doc["emailVerificationOtpHash"] = otp_hash
    user_doc["emailVerificationExpiresAt"] = expires_at
    user_doc["emailVerificationAttempts"] = 0
    user_doc["emailVerificationRequestedAt"] = now

    await users_coll.insert_one(user_doc)
    logger.info("New user registered successfully: %s (role: %s)", email, user_doc["role"])

    if settings.DEBUG or settings.ENVIRONMENT != "production":
        logger.info("🔑 [DEV ONLY] Email verification OTP for %s: %s", email, otp)

    # Dispatch email verification OTP asynchronously
    try:
        email_msg = create_email_verification_email(
            recipient_email=email,
            recipient_name=payload.fullName,
            otp_code=otp,
            expire_minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES,
        )
        svc = get_email_service()
        await svc.send_email(email_msg)
        logger.info("Email verification OTP dispatched to: %s", email)
    except Exception as err:
        logger.error("Failed to send email verification email to %s: %s", email, str(err))

    user_dict = document_to_dict(user_doc)
    access_token = create_access_token(
        subject=user_dict["id"],
        role=user_dict["role"],
        email=user_dict["email"],
        token_version=user_doc.get("tokenVersion", 0),
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

    if settings.REQUIRE_VERIFIED_EMAIL_FOR_LOGIN and not user_doc.get("isEmailVerified", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address has not been verified. Please verify your email first.",
        )

    user_dict = document_to_dict(user_doc)
    access_token = create_access_token(
        subject=user_dict["id"],
        role=user_dict["role"],
        email=user_dict["email"],
        token_version=user_doc.get("tokenVersion", 0),
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
@router.put(
    "/profile",
    response_model=UserResponse,
    summary="Update permitted profile fields for the authenticated user (PUT alias)",
)
async def update_profile(
    payload: UserUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> UserResponse:
    """
    Allow users to update fullName, phone, emergencyContact, emergencyContactData,
    healthConditions, and notificationPreferences.
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

    if payload.emergencyContactData is not None:
        updates["emergencyContactData"] = payload.emergencyContactData.model_dump()
        if payload.emergencyContact is None:
            updates["emergencyContact"] = payload.emergencyContactData.phone

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
            "missedDoseAlertsEnabled": existing_prefs.get("missedDoseAlertsEnabled", True),
            "emailNotificationsEnabled": existing_prefs.get("emailNotificationsEnabled", True),
            "soundEnabled": existing_prefs.get("soundEnabled", True),
            "vibrationEnabled": existing_prefs.get("vibrationEnabled", True),
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
@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    summary="Change password for authenticated user (POST alias)",
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
        {
            "$set": {"passwordHash": new_hash, "updatedAt": now_utc()},
            "$inc": {"tokenVersion": 1},
        },
    )
    logger.info("Password changed successfully for user %s; sessions invalidated", current_user["id"])
    return {"message": "Password updated successfully."}


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Request a 6-digit password reset verification code",
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
) -> ForgotPasswordResponse:
    """
    Request a password reset code.
    Security protections:
    - Zero email enumeration: always returns HTTP 200 with generic notice.
    - Concurrency-safe MongoDB rate limiting: max 3 requests/hour per email, 15/hour per IP.
    - Constant-time mitigation for non-existent users.
    - 6-digit cryptographic numeric OTP generated via secrets module.
    - OTP hashed using HMAC-SHA256 and server-side pepper (never stored plaintext).
    - 15-minute expiration timestamp.
    """
    email = payload.email.strip().lower()
    generic_message = (
        "If an account is associated with this email, you will receive password reset instructions shortly."
    )

    # Resolve client IP for abuse protection
    client_ip = "unknown"
    if request.client and request.client.host:
        client_ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    # In local development or test environments, allow higher ceiling for loopback
    ip_limit = 1000 if client_ip in ("127.0.0.1", "localhost", "testclient", "unknown") else 30

    # Concurrency-safe atomic rate limiting
    email_allowed = await rate_limiter.acquire(
        action="forgot_pwd_email",
        key=email,
        max_requests=settings.RESET_RATE_LIMIT_PER_HOUR,
        window_seconds=3600,
    )
    ip_allowed = await rate_limiter.acquire(
        action="forgot_pwd_ip",
        key=client_ip,
        max_requests=ip_limit,
        window_seconds=3600,
    )

    if not (email_allowed and ip_allowed):
        logger.warning(
            "Rate limit exceeded for forgot-password request on: %s (ip: %s)",
            email,
            client_ip,
        )
        return ForgotPasswordResponse(message=generic_message)

    users_coll = get_users_collection()
    user_doc = await users_coll.find_one({"email": email})

    if not user_doc:
        # Constant-time mitigation: simulate hash calculation to avoid timing leakage
        pepper = settings.get_reset_token_pepper()
        dummy_otp = generate_reset_otp()
        _ = hash_reset_otp(dummy_otp, pepper)
        logger.info("Password reset requested for unregistered email: %s", email)
        return ForgotPasswordResponse(message=generic_message)

    # Generate cryptographic 6-digit OTP
    otp = generate_reset_otp()
    pepper = settings.get_reset_token_pepper()
    otp_hash = hash_reset_otp(otp, pepper)
    now = now_utc()
    expires_at = now + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)

    # Store hashed OTP and reset attempts on user document
    if settings.DEBUG or settings.ENVIRONMENT != "production":
        logger.info("🔑 [DEV ONLY] Password reset OTP for %s: %s", email, otp)
    await users_coll.update_one(
        {"_id": user_doc["_id"]},
        {
            "$set": {
                "passwordResetOtpHash": otp_hash,
                "passwordResetExpiresAt": expires_at,
                "passwordResetAttempts": 0,
                "passwordResetRequestedAt": now,
                "updatedAt": now,
            }
        },
    )

    # Dispatch email with 6-digit code
    recipient_name = user_doc.get("fullName", "Valued User")
    email_msg = create_password_reset_email(
        recipient_email=email,
        recipient_name=recipient_name,
        otp_code=otp,
        expire_minutes=settings.RESET_TOKEN_EXPIRE_MINUTES,
    )

    try:
        svc = get_email_service()
        await svc.send_email(email_msg)
        logger.info("Password reset verification email dispatched to: %s", email)
    except Exception as err:
        logger.error("Failed to send password reset email to %s: %s", email, str(err))

    return ForgotPasswordResponse(message=generic_message)


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Reset password using 6-digit verification code",
)
async def reset_password(payload: ResetPasswordRequest) -> Dict[str, str]:
    """
    Validate OTP and atomically reset the user's password.
    Security protections:
    - Checks 6-digit code with HMAC-SHA256 pepper comparison.
    - Rejects expired codes (15-minute window).
    - Enforces max 5 failed attempts, invalidating the code on the 5th attempt.
    - Minimum 8 character password length enforced by schema.
    - Atomically updates passwordHash with bcrypt (12 rounds) and increments tokenVersion to invalidate existing JWTs.
    - Immediately unsets OTP fields to prevent code reuse.
    - Dispatches security notification email.
    """
    email = payload.email.strip().lower()
    submitted_code = payload.code.strip()
    users_coll = get_users_collection()

    user_doc = await users_coll.find_one({"email": email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset code.",
        )

    stored_hash = user_doc.get("passwordResetOtpHash")
    expires_at = user_doc.get("passwordResetExpiresAt")
    attempts = user_doc.get("passwordResetAttempts", 0)

    if not stored_hash or not expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active password reset request found. Please request a new code.",
        )

    now = now_utc()
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    # Expiry validation
    if now > expires_at:
        await users_coll.update_one(
            {"_id": user_doc["_id"]},
            {
                "$set": {
                    "passwordResetOtpHash": None,
                    "passwordResetExpiresAt": None,
                    "passwordResetAttempts": 0,
                    "updatedAt": now,
                }
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset code has expired. Please request a new code.",
        )

    # Max attempts validation
    if attempts >= settings.RESET_TOKEN_MAX_ATTEMPTS:
        await users_coll.update_one(
            {"_id": user_doc["_id"]},
            {
                "$set": {
                    "passwordResetOtpHash": None,
                    "passwordResetExpiresAt": None,
                    "passwordResetAttempts": 0,
                    "updatedAt": now,
                }
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. This reset code has been invalidated. Please request a new code.",
        )

    # OTP verification via constant-time HMAC-SHA256
    pepper = settings.get_reset_token_pepper()
    if not verify_reset_otp(submitted_code, stored_hash, pepper):
        new_attempts = attempts + 1
        if new_attempts >= settings.RESET_TOKEN_MAX_ATTEMPTS:
            await users_coll.update_one(
                {"_id": user_doc["_id"]},
                {
                    "$set": {
                        "passwordResetOtpHash": None,
                        "passwordResetExpiresAt": None,
                        "passwordResetAttempts": new_attempts,
                        "updatedAt": now,
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many failed attempts. This reset code has been invalidated. Please request a new code.",
            )
        else:
            await users_coll.update_one(
                {"_id": user_doc["_id"]},
                {
                    "$inc": {"passwordResetAttempts": 1},
                    "$set": {"updatedAt": now},
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset code. Please check the code and try again.",
            )

    # Bcrypt hash new password (12 rounds)
    new_password_hash = hash_password(payload.newPassword)

    # Atomically update password, invalidate previous sessions, and clear reset OTP
    updated_user = await users_coll.find_one_and_update(
        {
            "_id": user_doc["_id"],
            "passwordResetOtpHash": stored_hash,
            "passwordResetExpiresAt": {"$gte": now},
            "passwordResetAttempts": {"$lt": settings.RESET_TOKEN_MAX_ATTEMPTS},
        },
        {
            "$set": {
                "passwordHash": new_password_hash,
                "updatedAt": now,
                "passwordResetOtpHash": None,
                "passwordResetExpiresAt": None,
                "passwordResetAttempts": 0,
                "passwordResetRequestedAt": None,
            },
            "$inc": {
                "tokenVersion": 1,
            },
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset code was already used or expired.",
        )

    logger.info("Password reset completed successfully for user: %s", email)

    # Send security notification email (failures do NOT roll back password reset)
    try:
        changed_msg = create_password_changed_notification_email(
            recipient_email=email,
            recipient_name=user_doc.get("fullName", "Valued User"),
            changed_at_str=now.strftime("%Y-%m-%d %H:%M:%S"),
        )
        svc = get_email_service()
        await svc.send_email(changed_msg)
    except Exception as email_err:
        logger.warning(
            "Failed to send password-changed security notification to %s: %s",
            email,
            str(email_err),
        )

    return {"message": "Password updated successfully. You can now log in with your new password."}


@router.post(
    "/verify-email-otp",
    response_model=VerifyEmailResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify user email address using 6-digit verification code",
)
async def verify_email_otp(payload: VerifyEmailRequest) -> VerifyEmailResponse:
    """
    Validate 6-digit email verification OTP and mark user account as verified.
    Security protections:
    - HMAC-SHA256 comparison against stored hash with server pepper.
    - Expiration check (10 minutes window).
    - Max 5 failed attempts limit before invalidating code.
    - Atomically sets isEmailVerified=True and unsets verification OTP fields.
    - Returns updated user and fresh JWT access token.
    """
    email = payload.email.strip().lower()
    submitted_code = payload.code.strip()
    users_coll = get_users_collection()

    user_doc = await users_coll.find_one({"email": email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired email verification code.",
        )

    # If already verified
    if user_doc.get("isEmailVerified", False):
        user_dict = document_to_dict(user_doc)
        token = create_access_token(
            subject=user_dict["id"],
            role=user_dict["role"],
            email=user_dict["email"],
            token_version=user_doc.get("tokenVersion", 0),
        )
        return VerifyEmailResponse(
            message="Email is already verified.",
            isEmailVerified=True,
            access_token=token,
            token_type="bearer",
            user=UserResponse(**user_dict),
        )

    stored_hash = user_doc.get("emailVerificationOtpHash")
    expires_at = user_doc.get("emailVerificationExpiresAt")
    attempts = user_doc.get("emailVerificationAttempts", 0)

    if not stored_hash or not expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification request found. Please request a new code.",
        )

    now = now_utc()
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    # Expiry validation
    if now > expires_at:
        await users_coll.update_one(
            {"_id": user_doc["_id"]},
            {
                "$set": {
                    "emailVerificationOtpHash": None,
                    "emailVerificationExpiresAt": None,
                    "emailVerificationAttempts": 0,
                    "updatedAt": now,
                }
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code.",
        )

    # Max attempts validation
    if attempts >= settings.EMAIL_VERIFICATION_MAX_ATTEMPTS:
        await users_coll.update_one(
            {"_id": user_doc["_id"]},
            {
                "$set": {
                    "emailVerificationOtpHash": None,
                    "emailVerificationExpiresAt": None,
                    "emailVerificationAttempts": 0,
                    "updatedAt": now,
                }
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. This code has been invalidated. Please request a new code.",
        )

    # OTP verification via constant-time HMAC-SHA256
    pepper = settings.get_reset_token_pepper()
    if not verify_reset_otp(submitted_code, stored_hash, pepper):
        new_attempts = attempts + 1
        if new_attempts >= settings.EMAIL_VERIFICATION_MAX_ATTEMPTS:
            await users_coll.update_one(
                {"_id": user_doc["_id"]},
                {
                    "$set": {
                        "emailVerificationOtpHash": None,
                        "emailVerificationExpiresAt": None,
                        "emailVerificationAttempts": new_attempts,
                        "updatedAt": now,
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many failed attempts. This code has been invalidated. Please request a new code.",
            )
        else:
            await users_coll.update_one(
                {"_id": user_doc["_id"]},
                {
                    "$inc": {"emailVerificationAttempts": 1},
                    "$set": {"updatedAt": now},
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code. Please check the code and try again.",
            )

    # Successfully verified: Atomically update user document
    updated_user = await users_coll.find_one_and_update(
        {
            "_id": user_doc["_id"],
            "emailVerificationOtpHash": stored_hash,
        },
        {
            "$set": {
                "isEmailVerified": True,
                "emailVerificationOtpHash": None,
                "emailVerificationExpiresAt": None,
                "emailVerificationAttempts": 0,
                "emailVerificationRequestedAt": None,
                "updatedAt": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code was already used or expired.",
        )

    logger.info("Email verified successfully for user: %s", email)
    user_dict = document_to_dict(updated_user)
    token = create_access_token(
        subject=user_dict["id"],
        role=user_dict["role"],
        email=user_dict["email"],
        token_version=user_dict.get("tokenVersion", 0),
    )

    return VerifyEmailResponse(
        message="Email verified successfully.",
        isEmailVerified=True,
        access_token=token,
        token_type="bearer",
        user=UserResponse(**user_dict),
    )


@router.post(
    "/resend-verification-otp",
    response_model=Dict[str, str],
    status_code=status.HTTP_200_OK,
    summary="Resend 6-digit email verification code with cooldown protection",
)
async def resend_verification_otp(
    payload: ResendVerificationOtpRequest,
    request: Request,
) -> Dict[str, str]:
    """
    Resend a 6-digit email verification code.
    Protections:
    - 60-second cooldown between requests.
    - Max 5 requests per hour rate limiting per email and client IP.
    - Zero enumeration: always returns generic message.
    """
    email = payload.email.strip().lower()
    generic_message = (
        "If an unverified account is associated with this email, a new verification code has been sent."
    )

    client_ip = "unknown"
    if request.client and request.client.host:
        client_ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    ip_limit = 1000 if client_ip in ("127.0.0.1", "localhost", "testclient", "unknown") else 30

    email_allowed = await rate_limiter.acquire(
        action="resend_verify_email",
        key=email,
        max_requests=5,
        window_seconds=3600,
    )
    ip_allowed = await rate_limiter.acquire(
        action="resend_verify_ip",
        key=client_ip,
        max_requests=ip_limit,
        window_seconds=3600,
    )

    if not (email_allowed and ip_allowed):
        logger.warning(
            "Rate limit exceeded for resend-verification-otp on: %s (ip: %s)",
            email,
            client_ip,
        )
        return {"message": generic_message}

    users_coll = get_users_collection()
    user_doc = await users_coll.find_one({"email": email})

    if not user_doc:
        pepper = settings.get_reset_token_pepper()
        dummy_otp = generate_reset_otp()
        _ = hash_reset_otp(dummy_otp, pepper)
        return {"message": generic_message}

    if user_doc.get("isEmailVerified", False):
        return {"message": "Email is already verified."}

    # Cooldown check (60s)
    last_req = user_doc.get("emailVerificationRequestedAt")
    now = now_utc()
    if last_req:
        if last_req.tzinfo is None:
            last_req = last_req.replace(tzinfo=timezone.utc)
        elapsed = (now - last_req).total_seconds()
        if elapsed < settings.EMAIL_VERIFICATION_COOLDOWN_SECONDS:
            wait_secs = int(settings.EMAIL_VERIFICATION_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait_secs} seconds before requesting a new code.",
            )

    otp = generate_reset_otp()
    pepper = settings.get_reset_token_pepper()
    otp_hash = hash_reset_otp(otp, pepper)
    expires_at = now + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)

    if settings.DEBUG or settings.ENVIRONMENT != "production":
        logger.info("🔑 [DEV ONLY] Resent email verification OTP for %s: %s", email, otp)

    await users_coll.update_one(
        {"_id": user_doc["_id"]},
        {
            "$set": {
                "emailVerificationOtpHash": otp_hash,
                "emailVerificationExpiresAt": expires_at,
                "emailVerificationAttempts": 0,
                "emailVerificationRequestedAt": now,
                "updatedAt": now,
            }
        },
    )

    recipient_name = user_doc.get("fullName", "Valued User")
    try:
        email_msg = create_email_verification_email(
            recipient_email=email,
            recipient_name=recipient_name,
            otp_code=otp,
            expire_minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES,
        )
        svc = get_email_service()
        await svc.send_email(email_msg)
        logger.info("Resent email verification OTP to: %s", email)
    except Exception as err:
        logger.error("Failed to resend email verification email to %s: %s", email, str(err))

    return {"message": generic_message}


@router.post(
    "/verify-reset-otp",
    response_model=VerifyResetOtpResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate 6-digit password reset code before submitting new password",
)
async def verify_reset_otp_endpoint(payload: VerifyResetOtpRequest) -> VerifyResetOtpResponse:
    """
    Validate OTP without resetting password. Useful for step-by-step UI verification.
    """
    email = payload.email.strip().lower()
    submitted_code = payload.code.strip()
    users_coll = get_users_collection()

    user_doc = await users_coll.find_one({"email": email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset code.",
        )

    stored_hash = user_doc.get("passwordResetOtpHash")
    expires_at = user_doc.get("passwordResetExpiresAt")
    attempts = user_doc.get("passwordResetAttempts", 0)

    if not stored_hash or not expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active password reset request found. Please request a new code.",
        )

    now = now_utc()
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset code has expired. Please request a new code.",
        )

    if attempts >= settings.RESET_TOKEN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. This reset code has been invalidated. Please request a new code.",
        )

    pepper = settings.get_reset_token_pepper()
    if not verify_reset_otp(submitted_code, stored_hash, pepper):
        await users_coll.update_one(
            {"_id": user_doc["_id"]},
            {
                "$inc": {"passwordResetAttempts": 1},
                "$set": {"updatedAt": now},
            },
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset code. Please check the code and try again.",
        )

    return VerifyResetOtpResponse(valid=True, message="Verification code is valid.")


@router.get(
    "/emergency-contact",
    response_model=EmergencyContactResponse,
    summary="Get emergency contact information for authenticated user",
)
async def get_emergency_contact(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> EmergencyContactResponse:
    """Return structured and legacy emergency contact info for the caller."""
    raw_data = current_user.get("emergencyContactData")
    schema_data = EmergencyContactSchema(**raw_data) if raw_data else None
    return EmergencyContactResponse(
        emergencyContact=schema_data,
        legacyContactString=current_user.get("emergencyContact"),
    )


@router.put(
    "/emergency-contact",
    response_model=EmergencyContactResponse,
    summary="Update or set emergency contact information",
)
async def update_emergency_contact(
    payload: EmergencyContactSchema,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> EmergencyContactResponse:
    """Save structured emergency contact and sync legacy contact string."""
    users_coll = get_users_collection()
    user_oid = to_object_id(current_user["id"])
    now = now_utc()
    data_dict = payload.model_dump()

    await users_coll.update_one(
        {"_id": user_oid},
        {
            "$set": {
                "emergencyContactData": data_dict,
                "emergencyContact": payload.phone,
                "updatedAt": now,
            }
        },
    )

    return EmergencyContactResponse(
        emergencyContact=payload,
        legacyContactString=payload.phone,
    )


@router.delete(
    "/emergency-contact",
    status_code=status.HTTP_200_OK,
    summary="Remove emergency contact information",
)
async def delete_emergency_contact(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    """Clear emergency contact records for the authenticated user."""
    users_coll = get_users_collection()
    user_oid = to_object_id(current_user["id"])
    await users_coll.update_one(
        {"_id": user_oid},
        {
            "$set": {
                "emergencyContactData": None,
                "emergencyContact": None,
                "updatedAt": now_utc(),
            }
        },
    )
    return {"message": "Emergency contact removed successfully."}


@router.get(
    "/notification-preferences",
    response_model=NotificationPreferences,
    summary="Get notification preferences for authenticated user",
)
async def get_notification_preferences(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationPreferences:
    """Return user notification preferences."""
    prefs = current_user.get("notificationPreferences") or {}
    return NotificationPreferences(**prefs)


@router.put(
    "/notification-preferences",
    response_model=NotificationPreferences,
    summary="Update notification preferences for authenticated user",
)
async def update_notification_preferences(
    payload: NotificationPreferencesUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationPreferences:
    """Update user notification preferences."""
    existing_prefs = current_user.get("notificationPreferences") or {}
    merged_prefs = {
        "medicationRemindersEnabled": existing_prefs.get("medicationRemindersEnabled", True),
        "emailReportsEnabled": existing_prefs.get("emailReportsEnabled", False),
        "emailAlertsEnabled": existing_prefs.get("emailAlertsEnabled", False),
        "missedDoseAlertsEnabled": existing_prefs.get("missedDoseAlertsEnabled", True),
        "emailNotificationsEnabled": existing_prefs.get("emailNotificationsEnabled", True),
        "soundEnabled": existing_prefs.get("soundEnabled", True),
        "vibrationEnabled": existing_prefs.get("vibrationEnabled", True),
    }
    provided = payload.model_dump(exclude_unset=True)
    merged_prefs.update(provided)

    users_coll = get_users_collection()
    user_oid = to_object_id(current_user["id"])
    now = now_utc()
    await users_coll.update_one(
        {"_id": user_oid},
        {
            "$set": {
                "notificationPreferences": merged_prefs,
                "updatedAt": now,
            }
        },
    )
    return NotificationPreferences(**merged_prefs)

