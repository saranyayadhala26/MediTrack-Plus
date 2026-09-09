"""Unit tests for MongoDB ObjectId conversion and document serialization utilities."""

from datetime import datetime, timezone
import pytest
from bson import ObjectId
from pydantic import BaseModel
from app.utils.mongo import (
    PyObjectId,
    to_object_id,
    is_valid_object_id,
    document_to_dict,
    document_list_to_dicts,
)


class SampleModel(BaseModel):
    id: PyObjectId


def test_valid_object_id():
    """Verify ObjectId validation returns True for valid 24-char hex strings."""
    valid_id = "650c709e3e7f4c3a8e9e1234"
    assert is_valid_object_id(valid_id) is True
    assert is_valid_object_id("invalid-id") is False
    assert is_valid_object_id("123") is False


def test_to_object_id():
    """Verify to_object_id converts valid string to ObjectId and rejects invalid strings."""
    raw_str = "650c709e3e7f4c3a8e9e1234"
    oid = to_object_id(raw_str)
    assert isinstance(oid, ObjectId)
    assert str(oid) == raw_str

    # Passing existing ObjectId should return itself
    assert to_object_id(oid) == oid

    # Passing invalid string should raise ValueError
    with pytest.raises(ValueError, match="Invalid MongoDB ObjectId"):
        to_object_id("not-a-valid-hex")


def test_py_object_id_in_pydantic():
    """Verify PyObjectId works seamlessly in Pydantic models."""
    raw_str = "650c709e3e7f4c3a8e9e1234"
    model = SampleModel(id=raw_str)
    assert isinstance(model.id, ObjectId)
    assert str(model.id) == raw_str

    # Serialization to JSON/dict
    dumped = model.model_dump(mode="json")
    assert dumped["id"] == raw_str

    # Reject invalid ObjectId
    with pytest.raises(Exception):
        SampleModel(id="malformed-id")


def test_document_to_dict_serialization():
    """Verify document_to_dict converts _id, nested ObjectIds, and datetimes."""
    oid = ObjectId("650c709e3e7f4c3a8e9e1234")
    nested_oid = ObjectId("650c709e3e7f4c3a8e9e5678")
    now = datetime(2026, 9, 9, 12, 0, 0, tzinfo=timezone.utc)

    doc = {
        "_id": oid,
        "name": "Amoxicillin",
        "nested": {"subId": nested_oid},
        "createdAt": now,
        "tags": ["antibiotic", nested_oid],
        "nullField": None,
    }

    serialized = document_to_dict(doc)
    assert serialized is not None
    assert "id" in serialized
    assert serialized["id"] == str(oid)
    assert "_id" not in serialized
    assert serialized["nested"]["subId"] == str(nested_oid)
    assert serialized["createdAt"] == now.isoformat()
    assert serialized["tags"] == ["antibiotic", str(nested_oid)]


def test_document_list_to_dicts():
    """Verify document_list_to_dicts converts multiple documents."""
    docs = [
        {"_id": ObjectId("650c709e3e7f4c3a8e9e1111"), "val": 1},
        {"_id": ObjectId("650c709e3e7f4c3a8e9e2222"), "val": 2},
    ]
    results = document_list_to_dicts(docs)
    assert len(results) == 2
    assert results[0]["id"] == "650c709e3e7f4c3a8e9e1111"
    assert results[1]["id"] == "650c709e3e7f4c3a8e9e2222"
