from pydantic import BaseModel


class LinkCodeResponse(BaseModel):
    code: str
    expires_in_minutes: int


class BotInfoResponse(BaseModel):
    bot_username: str | None = None
