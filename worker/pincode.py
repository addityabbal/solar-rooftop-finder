"""Pincode validation: six digits, first digit 1 to 9."""
from __future__ import annotations

import re

_PINCODE = re.compile(r"[1-9][0-9]{5}")


class InvalidPincode(ValueError):
    pass


def is_valid_pincode(value: object) -> bool:
    return isinstance(value, str) and _PINCODE.fullmatch(value) is not None


def validate_pincode(value: object) -> str:
    text = value.strip() if isinstance(value, str) else value
    if not is_valid_pincode(text):
        raise InvalidPincode(f"Not a valid Indian pincode: {value!r}. Expected six digits, first digit 1 to 9.")
    return text  # type: ignore[return-value]
