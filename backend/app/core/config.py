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
    storage_backend: str = Field(default="local", alias="STORAGE_BACKEND")
    local_storage_root: str = Field(default="./var/storage", alias="LOCAL_STORAGE_ROOT")
    max_upload_size_mb: int = Field(default=25, alias="MAX_UPLOAD_SIZE_MB")

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

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Refuse to start a production process with development defaults.

        These are checks that are cheap here and expensive later: a deploy that
        boots with the shipped JWT secret, a wildcard CORS origin or cookies
        sent over plain HTTP looks healthy and is silently insecure. Failing at
        startup makes the misconfiguration impossible to miss.
        """
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
