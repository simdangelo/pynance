"""Import transactions from arbitrary CSV/Excel files.

Two-phase, stateless pipeline:

- `preview` reads and parses the file (no writes), validates every row and
  flags duplicates against the user's existing transactions.
- `commit` re-parses the same file with the confirmed configuration and
  writes only the selected rows, atomically (a single commit).

The parser is pure (no DB access), so preview and commit always agree.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Literal

from dateutil import parser as date_parser
from sqlalchemy import select
from sqlalchemy.orm import Session

from pynance.models.asset import Asset
from pynance.models.category import Category
from pynance.models.transaction import Transaction
from pynance.models.types import TransactionType
from pynance.schemas.import_data import ImportMapping
from pynance.services.asset import ensure_liquid_asset
from pynance.services.exceptions import AssetNotFoundError, CategoryNotFoundError

CSV_ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")
DELIMITERS = (",", ";", "\t", "|")

DATE_KEYWORDS = ("date", "data", "giorno")
DESCRIPTION_KEYWORDS = (
    "description",
    "descrizione",
    "details",
    "dettagli",
    "causale",
    "memo",
    "note",
)
AMOUNT_KEYWORDS = ("amount", "importo", "value", "valore")
TYPE_KEYWORDS = ("type", "tipo", "direzione", "segno")
CATEGORY_KEYWORDS = ("category", "categoria")

INCOME_WORDS = {
    "income",
    "entrata",
    "entrate",
    "accredito",
    "accrediti",
    "avere",
    "credit",
    "in",
    "+",
}
EXPENSE_WORDS = {
    "expense",
    "expenditure",
    "uscita",
    "uscite",
    "addebito",
    "addebiti",
    "dare",
    "debit",
    "out",
    "-",
}

RowStatus = Literal["ok", "invalid", "duplicate"]


@dataclass(frozen=True)
class ParseOptions:
    mapping: ImportMapping | None = None
    date_format: str = "auto"
    sheet: str | None = None
    delimiter: str | None = None


@dataclass(frozen=True)
class RawTable:
    headers: list[str]
    rows: list[dict[str, object]]
    sheets: list[str] | None = None
    delimiter: str | None = None
    encoding: str | None = None


@dataclass(frozen=True)
class ParsedRow:
    index: int
    values: dict[str, str]
    occurred_on: date | None
    description: str | None
    amount: Decimal | None
    direction: TransactionType | None
    category: str | None
    status: RowStatus
    reason: str | None = None
    duplicate_of: int | None = None


@dataclass(frozen=True)
class RowSummary:
    total: int
    ok: int
    invalid: int
    duplicate: int


@dataclass(frozen=True)
class PreviewResult:
    headers: list[str]
    sheets: list[str] | None
    delimiter: str | None
    encoding: str | None
    suggested_mapping: ImportMapping
    rows: list[ParsedRow]
    summary: RowSummary


@dataclass(frozen=True)
class CommitResult:
    transaction_ids: list[int]
    imported: int
    skipped: int


def parse_amount(value: object) -> Decimal:
    """Accept numbers, dot-decimal ('2.50'), European ('1.234,56', '48,6'),
    currency symbols, spaces and parenthesised negatives ('(12,50)')."""
    if isinstance(value, bool):
        raise InvalidOperation
    if isinstance(value, int | float | Decimal):
        return Decimal(str(value)).quantize(Decimal("0.01"))

    text = str(value).strip()
    if not text:
        raise InvalidOperation
    negative = text[0] in {"-", "−"}
    text = text.lstrip("-−").strip()
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()
    for symbol in ("€", "EUR", "eur", " "):
        text = text.replace(symbol, "")
    text = text.replace("\xa0", "").replace("'", "")
    if not text:
        raise InvalidOperation

    last_comma = text.rfind(",")
    last_dot = text.rfind(".")
    if last_comma > -1 and last_dot > -1:
        if last_comma > last_dot:
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif last_comma > -1:
        text = text.replace(",", ".")

    result = Decimal(text).quantize(Decimal("0.01"))
    return -result if negative else result


def _parse_date(value: object, date_format: str) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None

    if date_format == "iso":
        try:
            return date.fromisoformat(text[:10])
        except ValueError as error:
            raise ValueError("Unrecognized date") from error
    if date_format == "auto" and len(text) >= 10 and text[:4].isdigit() and text[4] in "-/":
        try:
            return date.fromisoformat(text[:10].replace("/", "-"))
        except ValueError:
            pass
    try:
        return date_parser.parse(text, dayfirst=date_format != "mdy", fuzzy=False).date()
    except (ValueError, OverflowError) as error:
        raise ValueError("Unrecognized date") from error


def _direction_from_text(value: object) -> TransactionType | None:
    text = _clean_text(value)
    if text is None:
        return None
    normalized = text.lower()
    if normalized in INCOME_WORDS:
        return TransactionType.INCOME
    if normalized in EXPENSE_WORDS:
        return TransactionType.EXPENSE
    return None


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _display_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _normalize_header(header: str) -> str:
    return " ".join(header.strip().lower().split())


def _as_objects(cells: Sequence[object]) -> list[object]:
    return list(cells)


def _unique_headers(cells: Sequence[object]) -> list[str]:
    headers: list[str] = []
    counts: dict[str, int] = {}
    for position, cell in enumerate(cells):
        name = str(cell).strip() if cell is not None else ""
        if not name:
            name = f"Column {position + 1}"
        if name in counts:
            counts[name] += 1
            name = f"{name} ({counts[name]})"
        else:
            counts[name] = 0
        headers.append(name)
    return headers


def _decode(content: bytes) -> tuple[str, str]:
    for encoding in CSV_ENCODINGS:
        try:
            return content.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode the file")


def _sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters="".join(DELIMITERS)).delimiter
    except csv.Error:
        counts = {delimiter: sample.count(delimiter) for delimiter in DELIMITERS}
        best = max(counts, key=lambda delimiter: counts[delimiter])
        return best if counts[best] else ","


def _read_csv(content: bytes, options: ParseOptions) -> RawTable:
    text, encoding = _decode(content)
    delimiter = options.delimiter or _sniff_delimiter(text[:4096])
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    raw_rows = [row for row in reader if any(str(cell).strip() for cell in row)]
    if not raw_rows:
        raise ValueError("The file has no rows")
    headers = _unique_headers(_as_objects(raw_rows[0]))
    rows = [dict(zip(headers, _as_objects(row), strict=False)) for row in raw_rows[1:]]
    return RawTable(
        headers=headers,
        rows=rows,
        delimiter=delimiter,
        encoding=encoding,
    )


def _read_excel(content: bytes, options: ParseOptions) -> RawTable:
    import openpyxl

    workbook = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
    sheets = list(workbook.sheetnames)
    sheet_name = options.sheet or (sheets[0] if sheets else None)
    if sheet_name is None or sheet_name not in sheets:
        raise ValueError("Sheet not found in the workbook")

    worksheet = workbook[sheet_name]
    raw_rows = [
        list(row)
        for row in worksheet.iter_rows(values_only=True)
        if any(cell is not None and str(cell).strip() for cell in row)
    ]
    if not raw_rows:
        raise ValueError("The sheet has no rows")
    headers = _unique_headers(raw_rows[0])
    rows = [dict(zip(headers, _as_objects(row), strict=False)) for row in raw_rows[1:]]
    return RawTable(headers=headers, rows=rows, sheets=sheets)


def read_table(filename: str, content: bytes, options: ParseOptions) -> RawTable:
    name = filename.lower()
    if name.endswith(".csv"):
        return _read_csv(content, options)
    if name.endswith(".xlsx"):
        return _read_excel(content, options)
    raise ValueError("Unsupported file type. Use CSV or Excel (.csv, .xlsx).")


def _find_column(headers: list[str], keywords: tuple[str, ...], used: set[str]) -> str | None:
    candidates = [header for header in headers if header not in used]
    for header in candidates:
        if _normalize_header(header) in keywords:
            return header
    for header in candidates:
        normalized = _normalize_header(header)
        if any(
            normalized.startswith(keyword) or keyword in normalized.split() for keyword in keywords
        ):
            return header
    return None


def _guess_column(table: RawTable, used: set[str], probe: str) -> str | None:
    for header in table.headers:
        if header in used:
            continue
        samples = [
            row.get(header)
            for row in table.rows[:8]
            if row.get(header) is not None and str(row.get(header)).strip()
        ][:5]
        if not samples:
            continue
        hits = 0
        for sample in samples:
            try:
                if probe == "date":
                    _parse_date(sample, "auto")
                else:
                    parse_amount(sample)
            except ValueError, InvalidOperation:
                continue
            hits += 1
        if hits and hits >= max(1, len(samples) // 2):
            return header
    return None


def suggest_mapping(table: RawTable) -> ImportMapping:
    used: set[str] = set()

    date_column = _find_column(table.headers, DATE_KEYWORDS, used) or _guess_column(
        table, used, "date"
    )
    if date_column:
        used.add(date_column)

    description = _find_column(table.headers, DESCRIPTION_KEYWORDS, used)
    if description:
        used.add(description)

    category = _find_column(table.headers, CATEGORY_KEYWORDS, used)
    if category:
        used.add(category)

    type_column = _find_column(table.headers, TYPE_KEYWORDS, used)
    if type_column:
        used.add(type_column)

    amount = _find_column(table.headers, AMOUNT_KEYWORDS, used)
    if amount:
        used.add(amount)
    else:
        amount = _guess_column(table, used, "amount")

    return ImportMapping(
        date=date_column,
        description=description,
        amount=amount,
        type=type_column,
        debit=None,
        credit=None,
        category=category,
    )


def _optional_amount(value: object) -> Decimal | None:
    if value is None or not str(value).strip():
        return None
    try:
        return abs(parse_amount(value))
    except InvalidOperation, ValueError:
        return None


def _parse_row(
    index: int, raw: dict[str, object], mapping: ImportMapping, date_format: str
) -> ParsedRow:
    values = {header: _display_value(value) for header, value in raw.items()}
    description = _clean_text(raw.get(mapping.description)) if mapping.description else None
    category = _clean_text(raw.get(mapping.category)) if mapping.category else None

    def invalid(reason: str) -> ParsedRow:
        return ParsedRow(
            index=index,
            values=values,
            occurred_on=None,
            description=description,
            amount=None,
            direction=None,
            category=category,
            status="invalid",
            reason=reason,
        )

    if not mapping.date:
        return invalid("No date column mapped")
    try:
        occurred_on = _parse_date(raw.get(mapping.date), date_format)
    except ValueError:
        return invalid("Unrecognized date")
    if occurred_on is None:
        return invalid("Missing date")

    amount: Decimal
    direction: TransactionType
    if mapping.amount:
        try:
            signed = parse_amount(raw.get(mapping.amount))
        except InvalidOperation, ValueError:
            return invalid("Unrecognized amount")
        amount = abs(signed)
        if mapping.type:
            from_type = _direction_from_text(raw.get(mapping.type))
            if from_type is None:
                return invalid("Unrecognized type")
            direction = from_type
        elif signed > 0:
            direction = TransactionType.INCOME
        elif signed < 0:
            direction = TransactionType.EXPENSE
        else:
            return invalid("Amount is zero")
    elif mapping.debit and mapping.credit:
        debit = _optional_amount(raw.get(mapping.debit))
        credit = _optional_amount(raw.get(mapping.credit))
        if debit is not None and credit is not None:
            return invalid("Both debit and credit are set")
        if debit is not None:
            amount, direction = debit, TransactionType.EXPENSE
        elif credit is not None:
            amount, direction = credit, TransactionType.INCOME
        else:
            return invalid("No amount")
    else:
        return invalid("No amount column mapped")

    if amount == 0:
        return invalid("Amount is zero")

    return ParsedRow(
        index=index,
        values=values,
        occurred_on=occurred_on,
        description=description,
        amount=amount,
        direction=direction,
        category=category,
        status="ok",
    )


def parse_rows(table: RawTable, options: ParseOptions) -> list[ParsedRow]:
    mapping = options.mapping or suggest_mapping(table)
    return [
        _parse_row(index, raw, mapping, options.date_format) for index, raw in enumerate(table.rows)
    ]


def _find_duplicates(
    db: Session,
    user_id: int,
    asset_id: int | None,
    rows: list[ParsedRow],
) -> dict[int, int]:
    dates = [
        row.occurred_on
        for row in rows
        if row.status == "ok" and row.occurred_on is not None and row.amount is not None
    ]
    if not dates:
        return {}

    query = select(
        Transaction.id,
        Transaction.occurred_on,
        Transaction.amount,
        Transaction.description,
    ).where(
        Transaction.user_id == user_id,
        Transaction.occurred_on >= min(dates),
        Transaction.occurred_on <= max(dates),
    )
    if asset_id is not None:
        query = query.where(Transaction.asset_id == asset_id)

    existing: dict[tuple[date, Decimal, str], int] = {}
    for transaction_id, occurred_on, amount, description in db.execute(query):
        key = (occurred_on, abs(amount), _normalize_text(description))
        existing[key] = int(transaction_id)

    duplicates: dict[int, int] = {}
    for row in rows:
        if row.status != "ok" or row.occurred_on is None or row.amount is None:
            continue
        key = (row.occurred_on, row.amount, _normalize_text(row.description or ""))
        found = existing.get(key)
        if found is not None:
            duplicates[row.index] = found
    return duplicates


def preview(
    db: Session,
    user_id: int,
    filename: str,
    content: bytes,
    options: ParseOptions,
    asset_id: int | None = None,
) -> PreviewResult:
    table = read_table(filename, content, options)
    suggested = suggest_mapping(table)
    effective = options.mapping or suggested
    rows = parse_rows(table, replace(options, mapping=effective))
    duplicates = _find_duplicates(db, user_id, asset_id, rows)
    marked = [
        replace(row, status="duplicate", duplicate_of=duplicates[row.index])
        if row.index in duplicates
        else row
        for row in rows
    ]
    summary = RowSummary(
        total=len(marked),
        ok=sum(1 for row in marked if row.status == "ok"),
        invalid=sum(1 for row in marked if row.status == "invalid"),
        duplicate=sum(1 for row in marked if row.status == "duplicate"),
    )
    return PreviewResult(
        headers=table.headers,
        sheets=table.sheets,
        delimiter=table.delimiter,
        encoding=table.encoding,
        suggested_mapping=suggested,
        rows=marked,
        summary=summary,
    )


def _get_asset(db: Session, user_id: int, asset_id: int) -> Asset:
    asset = db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    ).scalar_one_or_none()
    if asset is None:
        raise AssetNotFoundError(f"Asset with id {asset_id} doesn't exist")
    return asset


def _get_category(db: Session, user_id: int, category_id: int) -> Category:
    category = db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    ).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError(f"Category with id {category_id} doesn't exist")
    return category


def commit(
    db: Session,
    user_id: int,
    filename: str,
    content: bytes,
    options: ParseOptions,
    asset_id: int,
    selected_indexes: list[int],
    row_categories: dict[int, int],
) -> CommitResult:
    """Write the selected rows, each with the category chosen by the user."""
    table = read_table(filename, content, options)
    effective = options.mapping or suggest_mapping(table)
    rows = parse_rows(table, replace(options, mapping=effective))
    asset = _get_asset(db, user_id, asset_id)
    ensure_liquid_asset(asset)

    transaction_ids: list[int] = []
    skipped = 0

    for index in selected_indexes:
        if not 0 <= index < len(rows):
            skipped += 1
            continue
        row = rows[index]
        if (
            row.status != "ok"
            or row.occurred_on is None
            or row.amount is None
            or row.direction is None
        ):
            skipped += 1
            continue
        category_id = row_categories.get(index)
        if category_id is None:
            skipped += 1
            continue
        category = _get_category(db, user_id, category_id)
        if category.transaction_type != row.direction:
            skipped += 1
            continue
        transaction = Transaction(
            amount=row.amount,
            category_id=category.id,
            asset_id=asset.id,
            description=row.description or "",
            occurred_on=row.occurred_on,
            user_id=user_id,
        )
        db.add(transaction)
        db.flush()
        transaction_ids.append(transaction.id)

    db.commit()
    return CommitResult(
        transaction_ids=transaction_ids,
        imported=len(transaction_ids),
        skipped=skipped,
    )
