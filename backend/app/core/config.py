from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.security import parse_csv


class Settings(BaseSettings):
    database_url: str = "sqlite:///./journalism.db"
    aleph_base_url: str = "https://aleph.occrp.org"
    aleph_api_key: str = ""
    openaleph_enabled: bool = False
    openaleph_base_url: str = "http://127.0.0.1:8001"
    openaleph_ui_url: str = "http://127.0.0.1:8080"
    openaleph_api_key: str = ""
    openaleph_probe_timeout_seconds: float = 3.0
    openaleph_auto_sync_documents: bool = False
    enable_local_entity_suggestions: bool = True
    opensanctions_base_url: str = "https://api.opensanctions.org"
    opensanctions_api_key: str = ""
    opensanctions_dataset: str = "default"
    opensanctions_search_limit: int = 20
    firecrawl_base_url: str = "https://api.firecrawl.dev"
    firecrawl_api_key: str = ""
    firecrawl_search_limit: int = 20
    document_storage_dir: str = "./data/documents"
    connector_credentials_file: str = "./data/secrets/connectors.json"
    max_document_bytes: int = 50 * 1024 * 1024
    enable_pdf_ocr: bool = True
    pdf_ocr_language: str = "eng"
    pdf_ocr_dpi: int = 200
    pdf_ocr_min_native_chars: int = 20
    max_backup_bytes: int = 250 * 1024 * 1024
    max_backup_uncompressed_bytes: int = 1024 * 1024 * 1024
    max_backup_files: int = 10000
    max_zip_compression_ratio: int = 250
    enable_restore_api: bool = False
    app_environment: str = "development"
    enable_ai_features: bool = False
    # "" disables regardless of enable_ai_features; "anthropic" / "openai" selects the adapter.
    ai_provider: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    # Model ids are configuration, not code: a provider deprecation must not need a release.
    anthropic_model: str = "claude-sonnet-4-5"
    openai_model: str = "gpt-4.1"
    # Guard rails on the one endpoint family that spends money and holds a worker
    # thread (POST /investigations/{id}/assistant/*). All per-process, best-effort,
    # like api_auth_failure_limit_per_minute; put a real limiter at the edge for
    # multi-worker deployments.
    ai_request_timeout_seconds: float = 120.0
    ai_max_output_tokens: int = 8192
    ai_runs_per_minute: int = 6          # per actor (token / persisted user / local owner)
    ai_max_concurrent_runs: int = 2      # per process, all actors together
    cors_allowed_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:8000,http://localhost:8000"
    )
    api_auth_token: str = ""
    api_auth_investigation_ids: str = ""
    max_api_request_bytes: int = 10 * 1024 * 1024
    audit_log_file: str = "./data/audit/security.jsonl"
    api_auth_failure_limit_per_minute: int = 30
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return parse_csv(self.cors_allowed_origins)


settings = Settings()
