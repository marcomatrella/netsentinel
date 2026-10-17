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
    app_version: str = "1.1.14"
    app_env: str = "production"
    debug: bool = False

    # Network & Ports
    host: str = "0.0.0.0"
    port: int = 8181
    ingress_port: int = 8099

    # SSL / TLS Configuration
    ssl_enabled: bool = False
    ssl_certfile: str | None = None
    ssl_keyfile: str | None = None

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

    # Subnet override for discovery (e.g. '192.168.1.0/24')
    subnet: str | None = None

    def load_ha_options(self) -> None:
        """Safely load add-on options from /data/options.json if running inside Home Assistant."""
        import json

        options_file = Path(os.getenv("HA_OPTIONS_FILE", "/data/options.json"))
        if not options_file.is_file():
            return
        try:
            with open(options_file, encoding="utf-8") as f:
                opts = json.load(f)
            if not isinstance(opts, dict):
                return
            if opts.get("port"):
                self.port = int(opts["port"])
            if "ssl" in opts:
                self.ssl_enabled = bool(opts["ssl"])
            if opts.get("certfile"):
                self.ssl_certfile = str(opts["certfile"])
            if opts.get("keyfile"):
                self.ssl_keyfile = str(opts["keyfile"])
            if opts.get("subnet"):
                self.subnet = str(opts["subnet"])
            if opts.get("timezone"):
                self.timezone = str(opts["timezone"])
            if "auth_enabled" in opts:
                self.auth_enabled = bool(opts["auth_enabled"])
            if opts.get("ingress_port"):
                self.ingress_port = int(opts["ingress_port"])
        except Exception:
            # Non-blocking if options.json is unreadable or malformed
            pass

    def resolve_paths(self) -> None:
        """Ensure directories exist and resolve absolute database path."""
        self.load_ha_options()
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
