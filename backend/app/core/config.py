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
    # Who reads uploads (ADR-0004): auto = OpenAleph when the integration is
    # enabled, else the Workbench's own reader; openaleph | local force one.
    # OpenAleph falls back to the Workbench's reader when it cannot deliver.
    document_reader: str = "auto"
    openaleph_read_timeout_seconds: float = 900.0
    openaleph_read_poll_seconds: float = 3.0
    # Reporter-confirmed entities and relationships are written to the
    # investigation's OpenAleph collection by a background job (ADR-0006,
    # Wave B; app/jobs/corpus.py). A burst of changes is sent once, this many
    # seconds after the first of them.
    openaleph_corpus_push_delay_seconds: float = 5.0
    # How often the corpus jobs look at OpenAleph's queue while they wait for
    # it to finish indexing or cross-referencing, and how long they wait for
    # one cross-referencing run before giving up.
    openaleph_corpus_poll_seconds: float = 5.0
    openaleph_xref_timeout_seconds: float = 1800.0
    # Without a background worker (developer mode), "Sync now" runs the push
    # and cross-referencing inside the request, waiting at most this long; a
    # cross-referencing run still going then is picked up by the next "Sync now".
    openaleph_sync_now_wait_seconds: float = 120.0
    # A failed corpus job is tried again after 30 seconds, then after twice
    # as long each time up to this ceiling, at most this many times in a row;
    # after that the next change, or "Sync now", tries again.
    openaleph_corpus_retry_max_seconds: float = 900.0
    openaleph_corpus_max_retries: int = 10
    # Neighbours asked of OpenAleph per property when a reporter expands an
    # entity in the corpus (OpenAleph caps it at ALEPH_MAX_EXPAND_ENTITIES,
    # 200 by default, aleph/settings.py).
    openaleph_expand_limit: int = 50
    # How long a read waits for OpenAleph's ftm-analyze to finish finding
    # names (ADR-0006). The read still succeeds when it runs out; "Find names
    # again" fetches the names later.
    openaleph_analysis_timeout_seconds: float = 300.0
    # The Workbench's own pattern name-finder: only for documents OpenAleph
    # did not analyse (read by the fallback reader, or no analysis came back).
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
    # "" disables regardless of enable_ai_features; "anthropic" / "openai" / "ollama" selects the adapter.
    ai_provider: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    # Model ids are configuration, not code: a provider deprecation must not need a release.
    anthropic_model: str = "claude-sonnet-4-5"
    openai_model: str = "gpt-4.1"
    # "ollama": a model on the reporter's own computer (app/ai/llm_client.py).
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = ""   # none by default: the reporter picks an installed model
    # Off: the AI may only be a model on this computer (an Ollama address that
    # is this machine, and not an Ollama cloud model).
    ai_allow_remote_endpoint: bool = False
    # Guard rails on the one endpoint family that spends money and holds a worker
    # thread (POST /investigations/{id}/assistant/*). All per-process, best-effort,
    # like api_auth_failure_limit_per_minute; put a real limiter at the edge for
    # multi-worker deployments.
    ai_request_timeout_seconds: float = 120.0
    ai_max_output_tokens: int = 8192
    ai_runs_per_minute: int = 6          # per actor (token / persisted user / local owner)
    ai_max_concurrent_runs: int = 2      # per process, all actors together
    # The render service (render/, ADR-0005 line 2) that draws chart images for
    # PowerPoint and Word exports. Compose sets http://render:8070; exports fall
    # back to native charts and tables when it cannot be reached.
    render_service_url: str = "http://127.0.0.1:8070"
    # The self-hosted base map (ADR-0005, lines 4 and 18): world.pmtiles and
    # Protomaps' basemaps-assets (fonts, sprites), put there by the compose
    # profile `maps`. Maps say "no base map installed" when it is empty.
    basemap_dir: str = "./data/basemap"
    render_service_timeout_seconds: float = 15.0
    cors_allowed_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:8000,http://localhost:8000"
    )
    api_auth_token: str = ""
    api_auth_investigation_ids: str = ""
    # Comma-separated IPs/CIDRs of reverse proxies that sit in front of the app on
    # this host (for example "127.0.0.1" for nginx on the same machine). A request
    # that arrives from one of these is never treated as local, so a remote caller
    # cannot borrow the loopback trust of the proxy that forwarded them.
    trusted_proxy_ips: str = ""
    max_api_request_bytes: int = 10 * 1024 * 1024
    audit_log_file: str = "./data/audit/security.jsonl"
    api_auth_failure_limit_per_minute: int = 30
    # STRUCT-0035: persist the auth-failure limiter so a restart does not reset a
    # lockout ("" keeps it in-memory only), and the denial count over the last 24h
    # at which settings/status flags security.needs_attention.
    api_auth_failure_state_file: str = "./data/audit/auth-failures.json"
    security_alert_denials_per_day: int = 20
    # Operator console (/api/console/*, frontend /console): loopback-only tools to
    # inspect tables, run read-only SQL, list/probe endpoints, run the test suite
    # against an isolated database, and read the structured application log.
    console_enabled: bool = True
    # The Next.js workbench's static export (ADR-0004), served at "/". Empty
    # means <repo>/frontend/out (a local `npm run build`); Docker images set
    # FRONTEND_DIST_DIR=/srv/frontend (backend/Dockerfile).
    frontend_dist_dir: str = ""
    # Background jobs (app/jobs/runner.py): auto | inline | procrastinate.
    # auto = Procrastinate on PostgreSQL, in-process on SQLite.
    job_runner: str = "auto"
    job_worker_concurrency: int = 2
    # Read documents (OCR) in a separate process so the API keeps answering
    # (app/services/document_reader.py).
    document_read_in_subprocess: bool = True
    app_log_file: str = "./data/logs/app.jsonl"
    console_dir: str = "./data/console"   # test-run logs and the isolated test database
    # What the console may change: disabled | changesets | changesets_and_sql (ADR-0003).
    # Production defaults to read-only; the Windows launcher sets changesets.
    console_writes: str = "disabled"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return parse_csv(self.cors_allowed_origins)


settings = Settings()
