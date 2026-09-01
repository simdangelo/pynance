from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.services import importer

router = APIRouter()


@router.post("", status_code=status.HTTP_200_OK)
def import_data(
    file: UploadFile,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, int]:
    content = file.file.read()
    try:
        result = importer.import_file(db, current_user.id, file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {
        "categories_created": result.categories_created,
        "transactions_imported": result.transactions_imported,
        "skipped": result.skipped,
    }


@router.post("/preview", status_code=status.HTTP_200_OK)
def preview(
    file: UploadFile,
    current_user: CurrentUser,
) -> dict[str, list[dict[str, object]]]:
    content = file.file.read()
    try:
        rows = importer.preview_file(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {"rows": rows}
