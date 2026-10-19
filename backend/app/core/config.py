from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Shipped development values. Named once so the production guard below and
# .env.example cannot drift apart.
DEFAULT_JWT_SECRET = "change-me-in-real-environments-local-only"
DEFAULT_DB_PASSWORD = "change-this-local-password"

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def _is_loopback(origin: str) -> bool:
    return (urlparse(origin).hostname or "") in _LOOPBACK_HOSTS


class Settings(BaseSettings):
    environment: str = Field(default="development", alias="ENVIRONMENT")
    jwt_secret: str = Field(default=DEFAULT_JWT_SECRET, alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=60, alias="JWT_EXPIRE_MINUTES")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    frontend_origin: str = Field(default="http://localhost:5173", alias="FRONTEND_ORIGIN")
    database_url: str = Field(
        default="postgresql+psycopg://greenchain:change-this-local-password@localhost:5432/greenchain",
        alias="DATABASE_URL",
    )
    dev_seed_password: str | None = Field(default=None, alias="DEV_SEED_PASSWORD")
    # Demo-only: lets anyone who can reach the app sign in by picking an account from a list,
    # with no password. Off by default and refused in production (see validator below).
    account_select_login: bool = Field(default=False, alias="ACCOUNT_SELECT_LOGIN")
    storage_backend: str = Field(default="local", alias="STORAGE_BACKEND")
    local_storage_root: str = Field(default="./var/storage", alias="LOCAL_STORAGE_ROOT")
    max_upload_size_mb: int = Field(default=25, alias="MAX_UPLOAD_SIZE_MB")

    # S3 Object Lock evidence storage (STORAGE_BACKEND=s3). AWS credentials are never configured
    # here: boto3 resolves them from the standard chain (AWS_PROFILE, ~/.aws, or an IAM role).
    s3_bucket: str | None = Field(default=None, alias="S3_BUCKET")
    aws_region: str = Field(default="ap-southeast-1", alias="AWS_REGION")
    # Named profile from ~/.aws (credentials stay there, never in .env). Empty means boto3's default
    # chain: environment variables, the default profile, or an attached IAM role.
    aws_profile: str | None = Field(default=None, alias="AWS_PROFILE")
    s3_endpoint_url: str | None = Field(default=None, alias="S3_ENDPOINT_URL")
    s3_key_prefix: str = Field(default="", alias="S3_KEY_PREFIX")
    s3_object_lock_mode: str = Field(default="GOVERNANCE", alias="S3_OBJECT_LOCK_MODE")
    s3_retention_days: int = Field(default=1, alias="S3_RETENTION_DAYS")
    s3_lock_processed: bool = Field(default=True, alias="S3_LOCK_PROCESSED")
    s3_allow_compliance_mode: bool = Field(default=False, alias="S3_ALLOW_COMPLIANCE_MODE")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    @field_validator("jwt_expire_minutes")
    @classmethod
    def validate_expiry(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("JWT_EXPIRE_MINUTES must be greater than zero")
        return value

    @field_validator("max_upload_size_mb")
    @classmethod
    def validate_max_upload_size(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("MAX_UPLOAD_SIZE_MB must be greater than zero")
        return value

    @field_validator("s3_object_lock_mode")
    @classmethod
    def validate_object_lock_mode(cls, value: str) -> str:
        mode = value.strip().upper()
        if mode not in {"GOVERNANCE", "COMPLIANCE", "NONE"}:
            raise ValueError("S3_OBJECT_LOCK_MODE must be GOVERNANCE, COMPLIANCE or NONE")
        return mode

    @field_validator("s3_retention_days")
    @classmethod
    def validate_retention_days(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("S3_RETENTION_DAYS must be greater than zero")
        return value

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Refuse to start a production process with development defaults.

        These are checks that are cheap here and expensive later: a deploy that
        boots with the shipped JWT secret, a wildcard CORS origin or cookies
        sent over plain HTTP looks healthy and is silently insecure. Failing at
        startup makes the misconfiguration impossible to miss.
        """
        # COMPLIANCE retention cannot be shortened or removed by anyone, including the account root,
        # so it must be an explicit, deliberate opt-in in every environment, not a typo away.
        if self.s3_object_lock_mode == "COMPLIANCE" and not self.s3_allow_compliance_mode:
            raise ValueError("S3_OBJECT_LOCK_MODE=COMPLIANCE requires S3_ALLOW_COMPLIANCE_MODE=true")

        if not self.is_production:
            return self

        problems: list[str] = []

        if self.jwt_secret == DEFAULT_JWT_SECRET:
            problems.append("JWT_SECRET must be changed from its development default")
        if len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be at least 32 characters")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true so the session cookie is not sent over plain HTTP")
        if DEFAULT_DB_PASSWORD in self.database_url:
            problems.append("DATABASE_URL still contains the development default password")
        if self.account_select_login:
            problems.append("ACCOUNT_SELECT_LOGIN must be false: passwordless account selection is demo-only")

        for origin in self.frontend_origins:
            if origin == "*":
                problems.append("FRONTEND_ORIGIN must not be '*' while credentialed CORS is enabled")
            elif origin.startswith("http://") and not _is_loopback(origin):
                problems.append(f"FRONTEND_ORIGIN '{origin}' must use https in production")
            elif _is_loopback(origin):
                problems.append(f"FRONTEND_ORIGIN '{origin}' points at localhost, which is not a production origin")

        if not self.frontend_origins:
            problems.append("FRONTEND_ORIGIN must name at least one allowed origin")

        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def frontend_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origin.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
