from fastapi import APIRouter

from pynance.config import settings
from pynance.schemas.demo import AppConfigResponse

router = APIRouter()


@router.get("", response_model=AppConfigResponse, status_code=200)
def get_config() -> AppConfigResponse:
    return AppConfigResponse(demo_data_enabled=settings.enable_demo_data)
