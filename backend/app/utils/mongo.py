"""MongoDB utility helpers for ObjectId conversion and document serialization."""

from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
from pydantic import GetCoreSchemaHandler, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema, core_schema


class PyObjectId(ObjectId):
    """Custom type for handling MongoDB ObjectId in Pydantic v2 schemas."""

    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source_type: Any, _handler: GetCoreSchemaHandler
    ) -> CoreSchema:
        def validate_from_str(value: Union[str, ObjectId]) -> ObjectId:
            if isinstance(value, ObjectId):
                return value
            if isinstance(value, str):
                if ObjectId.is_valid(value):
                    return ObjectId(value)
                raise ValueError(f"Invalid ObjectId string: '{value}'")
            raise ValueError(f"Expected str or ObjectId, got {type(value)}")

        from_str_schema = core_schema.chain_schema([
            core_schema.str_schema(),
            core_schema.no_info_plain_validator_function(validate_from_str),
        ])

        return core_schema.json_or_python_schema(
            json_schema=from_str_schema,
            python_schema=core_schema.union_schema([
                core_schema.is_instance_schema(ObjectId),
                from_str_schema,
            ]),
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda x: str(x)
            ),
        )

    @classmethod
    def __get_pydantic_json_schema__(
        cls, _core_schema: CoreSchema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        json_schema = handler(core_schema.str_schema())
        json_schema.update(
            type="string",
            example="650c709e3e7f4c3a8e9e1234",
            description="24-character hexadecimal MongoDB ObjectId string",
        )
        return json_schema


def to_object_id(id_val: Union[str, ObjectId]) -> ObjectId:
    """Safely convert a string or ObjectId to a valid ObjectId."""
    if isinstance(id_val, ObjectId):
        return id_val
    if isinstance(id_val, str) and ObjectId.is_valid(id_val):
        return ObjectId(id_val)
    raise ValueError(f"Invalid MongoDB ObjectId: '{id_val}'")


def is_valid_object_id(id_val: str) -> bool:
    """Return True if the string is a valid 24-character hex ObjectId."""
    return isinstance(id_val, str) and ObjectId.is_valid(id_val)


def document_to_dict(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Recursively serialize a MongoDB document for JSON / Pydantic consumption:
    - Converts `_id` to `id` (as a 24-char hex string)
    - Converts any nested ObjectId to string
    - Converts datetime objects to ISO-8601 strings
    """
    if doc is None:
        return None

    result: Dict[str, Any] = {}
    for key, value in doc.items():
        if key == "_id":
            result["id"] = str(value)
        elif isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = document_to_dict(value)
        elif isinstance(value, list):
            result[key] = [
                document_to_dict(item) if isinstance(item, dict)
                else str(item) if isinstance(item, ObjectId)
                else item.isoformat() if isinstance(item, datetime)
                else item
                for item in value
            ]
        else:
            result[key] = value
    return result


def document_list_to_dicts(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert a list of MongoDB documents to serialized dictionaries."""
    return [document_to_dict(d) for d in docs if d is not None]
