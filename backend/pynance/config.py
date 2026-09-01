from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8")
    postgres_user: str
    postgres_password: SecretStr
    postgres_host: str
    postgres_port: str
    postgres_db: str
    telegram_bot_token: SecretStr = SecretStr("")
    telegram_allowed_chat_id: int = 0
    access_session_expire_days: int = 30
    allowed_hosts: list[str] = ["localhost", "127.0.0.1"]

    @property
    def database_url(self) -> str:
        return f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password.get_secret_value()}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"


settings = Settings()  # type: ignore[call-arg] # Loaded from .env file
