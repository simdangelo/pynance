from pydantic import BaseModel


class AppConfigResponse(BaseModel):
    demo_data_enabled: bool


class DemoDataResponse(BaseModel):
    transactions_created: int
    transfers_created: int
    adjustments_created: int
