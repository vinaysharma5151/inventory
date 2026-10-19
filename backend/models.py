"""
models.py — Pydantic schemas for request bodies and responses.

Keep it flat: one model per domain concept, no inheritance chains.
"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, field_validator
import re


# ---------------------------------------------------------------------------
# Article
# ---------------------------------------------------------------------------
class ArticleUpdate(BaseModel):
    """Fields allowed in a PUT /api/articles/:id request."""
    article_id:       Optional[str]   = None
    title:            Optional[str]   = None
    category:         Optional[str]   = None
    price:            Optional[float] = None
    security_deposit: Optional[float] = None
    advance_amount:   Optional[float] = None
    balance_amount:   Optional[float] = None
    color:            Optional[str]   = None
    size:             Optional[str]   = None
    notes:            Optional[str]   = None
    customer_name:    Optional[str]   = None
    customer_phone:   Optional[str]   = None
    customer_address: Optional[str]   = None
    pickup_date:      Optional[str]   = None
    booking_date:     Optional[str]   = None
    return_date:      Optional[str]   = None
    salesman_name:    Optional[str]   = None

    @field_validator("price", "security_deposit", "advance_amount", "balance_amount", mode="before")
    @classmethod
    def validate_non_negative(cls, v):
        """Ensure monetary values are valid non-negative numbers."""
        if v is not None and v != "":
            try:
                val = float(v)
                if val < 0:
                    raise ValueError("Amount cannot be negative")
                return val
            except (ValueError, TypeError):
                raise ValueError("Amount must be a valid non-negative number")
        return v

    @field_validator("customer_phone", mode="before")
    @classmethod
    def validate_phone(cls, v):
        """Strip spaces and dashes from phone numbers, allow empty or digits."""
        if v is not None:
            cleaned = re.sub(r"[\s\-\(\)]", "", str(v))
            return cleaned
        return v


# ---------------------------------------------------------------------------
# Salesman / Staff
# ---------------------------------------------------------------------------
class SalesmanCreate(BaseModel):
    name:     str
    password: Optional[str] = ""


class SalesmanLogin(BaseModel):
    name:     str
    password: Optional[str] = ""


# ---------------------------------------------------------------------------
# Authentication & RBAC Models
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    """User login with username and password."""
    username: str
    password: str


class ClearDuesRequest(BaseModel):
    """Clear dues payload for marking balance as zero."""
    notes: Optional[str] = None

