"""Security and cryptographic operations module."""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Any, Dict, Optional, Union
import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hashed password."""
    try:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False


def generate_reset_otp() -> str:
    """Generate a cryptographically secure 6-digit numeric OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_reset_otp(otp: str, pepper: str) -> str:
    """Hash a 6-digit OTP using server-side pepper and HMAC-SHA256."""
    return hmac.new(
        pepper.encode("utf-8"),
        otp.strip().encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


def verify_reset_otp(plain_otp: str, hashed_otp: str, pepper: str) -> bool:
    """Verify a plaintext 6-digit OTP against a stored HMAC-SHA256 digest in constant time."""
    if not plain_otp or not hashed_otp or not pepper:
        return False
    expected = hash_reset_otp(plain_otp, pepper)
    return hmac.compare_digest(expected, hashed_otp)


def create_access_token(
    subject: Union[str, Any],
    role: Optional[str] = None,
    email: Optional[str] = None,
    token_version: int = 0,
    claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a signed JWT access token containing identity, role, and token version claims."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "token_version": token_version,
    }
    if role:
        to_encode["role"] = role
    if email:
        to_encode["email"] = email
    if claims:
        to_encode.update(claims)

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access token, returning payload dictionary."""
    try:
        decoded = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return decoded
    except (jwt.PyJWTError, Exception):
        return None
