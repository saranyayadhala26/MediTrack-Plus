"""FastAPI Authentication and Role-Based Authorization Dependencies."""

from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.db.mongodb import get_users_collection
from app.schemas.user import UserRole
from app.utils.mongo import document_to_dict, to_object_id

# Security scheme for Bearer tokens
security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Dict[str, Any]:
    """
    Extract, validate JWT Bearer token, and fetch authenticated user from MongoDB Atlas.
    Raises HTTP 401 on missing, invalid, or expired tokens.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing user identity.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_oid = to_object_id(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed user ID in token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    users_coll = get_users_collection()
    user_doc = await users_coll.find_one({"_id": user_oid})
    if user_doc is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or has been removed.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Validate tokenVersion for session invalidation (defaults to 0 for backwards compatibility)
    token_version = payload.get("token_version", 0)
    current_token_version = user_doc.get("tokenVersion", 0)
    if token_version != current_token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or was invalidated. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return document_to_dict(user_doc)


async def get_current_patient(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Authorize that the authenticated caller has the Patient role.
    Caregivers or unauthorized roles are denied access to private patient data.
    """
    if current_user.get("role") != UserRole.PATIENT.value and current_user.get("role") != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Patient role required.",
        )
    return current_user


async def get_current_caregiver(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Authorize that the authenticated caller has the Caregiver role.
    """
    if current_user.get("role") != UserRole.CAREGIVER.value and current_user.get("role") != UserRole.CAREGIVER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Caregiver role required.",
        )
    return current_user
