from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.config import settings
from pynance.database import get_db
from pynance.schemas.demo import DemoDataResponse
from pynance.services import demo_data as demo_data_service

router = APIRouter()


@router.post("", response_model=DemoDataResponse, status_code=status.HTTP_200_OK)
def generate_demo_data(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> DemoDataResponse:
    if not settings.enable_demo_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    result = demo_data_service.generate_demo_data(db, current_user.id)
    return DemoDataResponse(
        transactions_created=result.transactions_created,
        transfers_created=result.transfers_created,
        adjustments_created=result.adjustments_created,
    )
