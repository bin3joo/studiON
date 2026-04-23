from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Studion AI"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    environment: str = "local"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="STUDION_AI_", extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
