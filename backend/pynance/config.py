from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8")
    postgres_user: str = ""
    postgres_password: SecretStr = SecretStr("")
    postgres_host: str = ""
    postgres_port: str = ""
    postgres_db: str = ""
    database_url_env: str = Field(default="", validation_alias="DATABASE_URL")
    telegram_bot_token: SecretStr = SecretStr("")
    access_session_expire_days: int = 30
    allowed_hosts: list[str] = ["localhost", "127.0.0.1"]
    secure_cookies: bool = False

    @property
    def resolved_database_url(self) -> str:
        if self.database_url_env:
            # Normalize the platform-provided string to the psycopg driver
            # the project uses (accepts both postgres:// and postgresql://).
            if self.database_url_env.startswith("postgres://"):
                return self.database_url_env.replace("postgres://", "postgresql+psycopg://", 1)
            if self.database_url_env.startswith("postgresql://"):
                return self.database_url_env.replace("postgresql://", "postgresql+psycopg://", 1)
            return self.database_url_env
        return f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password.get_secret_value()}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"


settings = Settings()
