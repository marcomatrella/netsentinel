"""NetSentinel configuration settings using Pydantic Settings."""

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment or defaults."""

    model_config = SettingsConfigDict(
        env_prefix="NETSENTINEL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "NetSentinel"
    app_version: str = "0.1.0"
    app_env: str = "production"
    debug: bool = False

    host: str = "0.0.0.0"
    port: int = 8080

    # Storage paths
    data_dir: str = os.getenv("NETSENTINEL_DATA_DIR", "./data")
    database_url: str | None = None
    secret_key: str | None = None

    # Timezone & localization
    timezone: str = "Europe/Rome"
    locale: str = "it"

    # Retention policies (days)
    retention_raw_days: int = 7
    retention_hourly_days: int = 90

    # Performance & Batching
    batch_write_interval_seconds: float = 2.0
    batch_write_max_size: int = 100

    # Dead-man's switch / External Heartbeat (e.g. Healthchecks.io)
    heartbeat_url: str | None = None
    heartbeat_interval_seconds: int = 60

    # Vantage point
    vantage_point_id: str | None = None

    # Auth
    auth_enabled: bool = False
    admin_password_hash: str | None = None
    jwt_secret: str = "netsentinel-insecure-change-me"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Frontend static files directory
    static_dir: str = "frontend/dist"

    def resolve_paths(self) -> None:
        """Ensure directories exist and resolve absolute database path."""
        path = Path(self.data_dir).resolve()
        path.mkdir(parents=True, exist_ok=True)
        if not self.database_url:
            db_path = path / "netsentinel.db"
            self.database_url = f"sqlite+aiosqlite:///{db_path}"


settings = Settings()
settings.resolve_paths()
