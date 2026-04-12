import uuid
from datetime import date as _Date
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


ReportingRule = Literal["default", "expense", "income", "transfer"]


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    parent_id: Optional[uuid.UUID] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    reporting_rule: ReportingRule = "default"
    example_count: int = 0


class CategoryCreate(BaseModel):
    name: str
    parent_id: Optional[uuid.UUID] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    reporting_rule: ReportingRule = "default"
    # Seed phrases used to establish the base matching pool
    seed_phrases: list[str] = []


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    reporting_rule: Optional[ReportingRule] = None
    seed_phrases: list[str] = []


class CategoryAssign(BaseModel):
    category_id: Optional[uuid.UUID] = None
    learn: bool = True


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    upload_id: uuid.UUID
    date: _Date
    description: str
    amount: Decimal
    balance: Optional[Decimal] = None
    status: str
    category_id: Optional[uuid.UUID] = None
    category_name: Optional[str] = None
    classification_level: Optional[int] = None
    similarity_score: Optional[float] = None
    override_amount: Optional[Decimal] = None
    dedup_hash: str
    created_at: Optional[datetime] = None
    bbox: Optional[dict] = None


class UploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    bank_name: str
    account_type: Optional[str] = None
    period_start: Optional[_Date] = None
    period_end: Optional[_Date] = None
    uploaded_at: Optional[datetime] = None
    status: str
    error_message: Optional[str] = None
    archived_at: Optional[datetime] = None


class UploadListItem(UploadRead):
    transaction_count: int


class UploadResponse(BaseModel):
    upload_id: uuid.UUID
    status: str


class TransactionCreate(BaseModel):
    date: _Date
    description: str
    amount: Decimal
    balance: Optional[Decimal] = None
    bbox: Optional[dict] = None


class TransactionUpdate(BaseModel):
    date: Optional[_Date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    balance: Optional[Decimal] = None
    bbox: Optional[dict] = None


class OverrideAmountUpdate(BaseModel):
    override_amount: Optional[Decimal] = None


class ReuploadPreviewTransaction(BaseModel):
    """A transaction extracted from the re-uploaded PDF that is new (not yet in the DB)."""
    date: _Date
    description: str
    amount: Decimal
    balance: Optional[Decimal] = None
    dedup_hash: str


class ReuploadPreviewResponse(BaseModel):
    new_count: int
    existing_count: int
    total_in_file: int
    # Warnings surfaced to the user before they confirm
    filename_changed: bool
    original_filename: str
    new_filename: str
    date_range_warning: Optional[str] = None
    new_transactions: list[ReuploadPreviewTransaction]


class ReuploadConfirmResponse(BaseModel):
    added_count: int
    classified_count: int
