from typing import Literal

from pydantic import BaseModel

from pynance.models.types import TransactionType


class ImportMapping(BaseModel):
    date: str | None = None
    description: str | None = None
    amount: str | None = None
    type: str | None = None
    debit: str | None = None
    credit: str | None = None
    category: str | None = None


class RowCategory(BaseModel):
    index: int
    category_id: int


class ImportRowPreview(BaseModel):
    index: int
    values: dict[str, str]
    date: str | None
    description: str | None
    amount: str | None
    direction: TransactionType | None
    category: str | None
    status: Literal["ok", "invalid", "duplicate"]
    reason: str | None
    duplicate_of: int | None


class ImportSummary(BaseModel):
    total: int
    ok: int
    invalid: int
    duplicate: int


class ImportPreviewResponse(BaseModel):
    headers: list[str]
    sheets: list[str] | None
    delimiter: str | None
    encoding: str | None
    suggested_mapping: ImportMapping
    rows: list[ImportRowPreview]
    summary: ImportSummary


class ImportCommitResponse(BaseModel):
    transaction_ids: list[int]
    imported: int
    skipped: int
