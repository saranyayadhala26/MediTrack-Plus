"""MongoDB-Backed Concurrency-Safe Rate Limiter Service (Phase 12.1).

Provides an atomic, race-condition-free rate limiter utilizing MongoDB's
atomic find_one_and_update with $inc and upsert operations.

Architecture & Concurrency Guarantees:
- Never uses unsafe 'count-then-insert' read-modify-write patterns.
- Atomically increments bucket counters under MongoDB document write locks.
- Simultaneous concurrent requests increment sequentially and cannot bypass configured limits.
- Supports automatic document cleanup via TTL index on 'expiresAt'.
- Pure service abstraction: No router or HTTP-layer coupling.
"""

from datetime import datetime, timedelta, timezone
import logging
from typing import Optional
from pymongo import ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection

from app.db.mongodb import get_rate_limits_collection

logger = logging.getLogger("meditrack.rate_limiter")


def now_utc() -> datetime:
    """Return current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class MongoRateLimiter:
    """Production-grade MongoDB-backed atomic rate limiter."""

    def __init__(self, collection: Optional[AsyncCollection] = None):
        self._collection = collection

    @property
    def collection(self) -> AsyncCollection:
        if self._collection is not None:
            return self._collection
        return get_rate_limits_collection()

    async def acquire(
        self,
        action: str,
        key: str,
        max_requests: int,
        window_seconds: int = 3600,
    ) -> bool:
        """
        Atomically record an attempt and determine if the caller is within rate limits.

        Returns True if the request is ALLOWED (count <= max_requests).
        Returns False if the limit has been EXCEEDED (count > max_requests).
        """
        if max_requests <= 0:
            return False

        normalized_action = action.strip().lower()
        normalized_key = key.strip().lower()
        now = now_utc()

        # Deterministic bucket partition by window timestamp
        bucket_id = int(now.timestamp() // window_seconds)
        doc_id = f"{normalized_action}:{normalized_key}:{bucket_id}"
        ttl_expiry = now + timedelta(seconds=window_seconds * 2)

        try:
            # Atomic upsert + increment: completely safe under arbitrary concurrency
            doc = await self.collection.find_one_and_update(
                {"_id": doc_id},
                {
                    "$inc": {"count": 1},
                    "$setOnInsert": {
                        "action": normalized_action,
                        "key": normalized_key,
                        "bucket": bucket_id,
                        "createdAt": now,
                        "expiresAt": ttl_expiry,
                    },
                },
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )

            current_count = doc.get("count", 1)
            is_allowed = current_count <= max_requests

            if not is_allowed:
                logger.warning(
                    "Rate limit exceeded for action='%s', key='%s': count=%d, max=%d",
                    normalized_action,
                    normalized_key,
                    current_count,
                    max_requests,
                )

            return is_allowed

        except Exception as e:
            # Log error safely without leaking credentials/payloads
            logger.error(
                "Rate limiter error for action='%s': %s. Failing closed to protect infrastructure.",
                normalized_action,
                str(e),
            )
            # In production security, rate limiter failures fail closed
            return False

    async def reset(self, action: str, key: str) -> None:
        """Reset rate limit state for a specific action and key (useful for tests)."""
        normalized_action = action.strip().lower()
        normalized_key = key.strip().lower()
        prefix = f"{normalized_action}:{normalized_key}:"
        await self.collection.delete_many({"_id": {"$regex": f"^{prefix}"}})


# Shared singleton instance
rate_limiter = MongoRateLimiter()
