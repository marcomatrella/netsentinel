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
        try:
            path.mkdir(parents=True, exist_ok=True)
        except PermissionError as e:
            uid = os.getuid() if hasattr(os, "getuid") else "unknown"
            raise PermissionError(
                f"\n[NetSentinel Error] Impossibile creare la cartella dati '{path}' (permesso negato, UID: {uid}).\n"
                f"Su Linux/Synology esegui sull'host:\n"
                f"   chown -R 1000:1000 {self.data_dir} (oppure chmod -R 777 {self.data_dir})\n"
                f"oppure aggiungi 'user: \"0:0\"' nel tuo docker-compose.yml.\n"
            ) from e

        if path.exists() and not os.access(path, os.W_OK):
            uid = os.getuid() if hasattr(os, "getuid") else "unknown"
            raise PermissionError(
                f"\n[NetSentinel Error] La directory dati '{path}' non è scrivibile dall'utente corrente (UID: {uid}).\n"
                f"SQLite richiede permessi di scrittura sulla directory per creare il database e i file WAL/lock.\n"
                f"Su Linux/Synology esegui sull'host:\n"
                f"   chown -R 1000:1000 {self.data_dir} (oppure chmod -R 777 {self.data_dir})\n"
                f"oppure aggiungi 'user: \"0:0\"' nel tuo docker-compose.yml.\n"
            )

        if not self.database_url:
            db_path = path / "netsentinel.db"
            self.database_url = f"sqlite+aiosqlite:///{db_path}"


settings = Settings()
settings.resolve_paths()
