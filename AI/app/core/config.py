from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Studion AI"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    environment: str = "local"
    workflow_queue_name: str = "workflow"
    dramatiq_broker_url: str | None = None
    mysql_url: str | None = None
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3307
    mysql_database: str | None = None
    mysql_user: str | None = None
    mysql_password: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="STUDION_AI_", extra="ignore")

    @property
    def resolved_mysql_url(self) -> str | None:
        if self.mysql_url:
            return self.mysql_url
        if not (
            self.mysql_database
            and self.mysql_user is not None
            and self.mysql_password is not None
        ):
            return None
        password = quote_plus(self.mysql_password)
        return (
            f"mysql+pymysql://{self.mysql_user}:{password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
            "?charset=utf8mb4"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
