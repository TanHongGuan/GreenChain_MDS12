from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = Field(default="development", alias="ENVIRONMENT")
    jwt_secret: str = Field(default="change-me-in-real-environments-local-only", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=60, alias="JWT_EXPIRE_MINUTES")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    frontend_origin: str = Field(default="http://localhost:5173", alias="FRONTEND_ORIGIN")
    database_url: str = Field(
        default="postgresql+psycopg://greenchain:change-this-local-password@localhost:5432/greenchain",
        alias="DATABASE_URL",
    )
    dev_seed_password: str | None = Field(default=None, alias="DEV_SEED_PASSWORD")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    @field_validator("jwt_expire_minutes")
    @classmethod
    def validate_expiry(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("JWT_EXPIRE_MINUTES must be greater than zero")
        return value

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.environment.lower() == "production" and self.jwt_secret == "change-me-in-real-environments-local-only":
            raise ValueError("JWT_SECRET must be set in production")
        return self

    @property
    def frontend_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origin.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
