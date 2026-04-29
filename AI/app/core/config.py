from functools import lru_cache
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Studion AI"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    environment: str = "local"
    log_level: str = "INFO"
    workflow_queue_name: str = "workflow"
    dramatiq_broker_url: str | None = None
    mysql_url: str | None = None
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3307
    mysql_database: str | None = None
    mysql_user: str | None = None
    mysql_password: str | None = None
    # timeline snapshot은 Mongo에 보관하므로 별도 연결 설정을 둔다.
    mongo_url: str | None = None
    mongo_database: str = "studion_ai"
    mongo_snapshot_collection: str = "timeline_snapshots"
    mongo_artifact_collection: str = "workflow_artifacts"
    audio_root: str | None = None
    clap_enabled: bool = True
    clap_inference_url: str | None = None
    clap_timeout_seconds: float = 20.0
    clap_connect_timeout_seconds: float = 5.0
    clap_vocal_threshold: float = 0.58

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


# 설정 객체도 매번 새로 만들 필요가 없어서 한 번 생성한 뒤 프로세스 동안 재사용한다.
# 환경변수/.env를 반복해서 다시 읽지 않게 하려는 캐시다.
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
