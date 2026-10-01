import json
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.schemas.import_data import (
    ImportCommitResponse,
    ImportMapping,
    ImportPreviewResponse,
    ImportRowPreview,
    ImportSummary,
    RowCategory,
)
from pynance.services import importer
from pynance.services.exceptions import (
    AssetNotFoundError,
    AssetNotLiquidError,
    CategoryNotFoundError,
)
from pynance.services.importer import ParsedRow, PreviewResult

router = APIRouter()

ROW_CATEGORIES_ADAPTER = TypeAdapter(list[RowCategory])


def _parse_mapping(raw: str | None) -> ImportMapping | None:
    if raw is None or not raw.strip():
        return None
    try:
        return ImportMapping.model_validate_json(raw)
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid mapping",
        ) from error


def _parse_selected_indexes(raw: str) -> list[int]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid selected_indexes",
        ) from error
    if not isinstance(data, list) or not all(isinstance(item, int) for item in data):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="selected_indexes must be a list of integers",
        )
    return [int(item) for item in data]


def _parse_row_categories(raw: str) -> dict[int, int]:
    try:
        entries = ROW_CATEGORIES_ADAPTER.validate_json(raw)
    except ValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid row_categories",
        ) from error
    return {entry.index: entry.category_id for entry in entries}


def _to_row_response(row: ParsedRow) -> ImportRowPreview:
    return ImportRowPreview(
        index=row.index,
        values=row.values,
        date=row.occurred_on.isoformat() if row.occurred_on else None,
        description=row.description,
        amount=str(row.amount) if row.amount is not None else None,
        direction=row.direction,
        category=row.category,
        status=row.status,
        reason=row.reason,
        duplicate_of=row.duplicate_of,
    )


def _to_preview_response(result: PreviewResult) -> ImportPreviewResponse:
    return ImportPreviewResponse(
        headers=result.headers,
        sheets=result.sheets,
        delimiter=result.delimiter,
        encoding=result.encoding,
        suggested_mapping=result.suggested_mapping,
        rows=[_to_row_response(row) for row in result.rows],
        summary=ImportSummary(
            total=result.summary.total,
            ok=result.summary.ok,
            invalid=result.summary.invalid,
            duplicate=result.summary.duplicate,
        ),
    )


@router.post("/preview", response_model=ImportPreviewResponse)
def preview(
    file: UploadFile,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    mapping: Annotated[str | None, Form()] = None,
    date_format: Annotated[str, Form()] = "auto",
    sheet: Annotated[str | None, Form()] = None,
    delimiter: Annotated[str | None, Form()] = None,
    asset_id: Annotated[int | None, Form()] = None,
) -> ImportPreviewResponse:
    options = importer.ParseOptions(
        mapping=_parse_mapping(mapping),
        date_format=date_format,
        sheet=sheet,
        delimiter=delimiter,
    )
    try:
        result = importer.preview(
            db, current_user.id, file.filename or "", file.file.read(), options, asset_id
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    return _to_preview_response(result)


@router.post("/commit", response_model=ImportCommitResponse)
def commit(
    file: UploadFile,
    asset_id: Annotated[int, Form()],
    selected_indexes: Annotated[str, Form()],
    row_categories: Annotated[str, Form()],
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    mapping: Annotated[str | None, Form()] = None,
    date_format: Annotated[str, Form()] = "auto",
    sheet: Annotated[str | None, Form()] = None,
    delimiter: Annotated[str | None, Form()] = None,
) -> ImportCommitResponse:
    options = importer.ParseOptions(
        mapping=_parse_mapping(mapping),
        date_format=date_format,
        sheet=sheet,
        delimiter=delimiter,
    )
    try:
        result = importer.commit(
            db,
            current_user.id,
            file.filename or "",
            file.file.read(),
            options,
            asset_id,
            _parse_selected_indexes(selected_indexes),
            _parse_row_categories(row_categories),
        )
    except (AssetNotFoundError, CategoryNotFoundError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except AssetNotLiquidError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    return ImportCommitResponse(
        transaction_ids=result.transaction_ids,
        imported=result.imported,
        skipped=result.skipped,
    )
