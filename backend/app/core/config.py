"""
Core Application Configuration & Environment Profile Management
---------------------------------------------------------------
Defines institutional runtime configuration profiles (DEVELOPMENT, STAGING, PRODUCTION)
with strict production gatekeeping: requiring robust non-default cryptographic secrets,
SSL database transports, and explicit CORS boundaries.
"""

import enum
import os
from typing import List, Optional


class EnvironmentProfile(str, enum.Enum):
    DEVELOPMENT = "DEVELOPMENT"
    STAGING = "STAGING"
    PRODUCTION = "PRODUCTION"


DEFAULT_INSECURE_SECRET = "super-secret-key-change-me-in-production"
DEFAULT_N8N_KEY = "super_secure_internal_orchestration_secret_key_2026"


class Settings:
    """
    Centralized runtime configuration reader with environment-aware validation.
    """

    def __init__(self, env_override: Optional[str] = None):
        raw_env = (
            env_override
            or os.getenv("APP_ENV")
            or os.getenv("ENVIRONMENT")
            or os.getenv("ENV")
            or "DEVELOPMENT"
        ).upper()

        if raw_env.startswith("PROD"):
            self.profile = EnvironmentProfile.PRODUCTION
        elif raw_env.startswith("STAG"):
            self.profile = EnvironmentProfile.STAGING
        else:
            self.profile = EnvironmentProfile.DEVELOPMENT

        self.secret_key: str = os.getenv("SECRET_KEY", DEFAULT_INSECURE_SECRET)
        self.n8n_api_key: str = os.getenv("N8N_API_KEY", DEFAULT_N8N_KEY)
        self.database_url: str = os.getenv(
            "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/fintech_db"
        )
        self.redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.allowed_origins: List[str] = [
            origin.strip()
            for origin in os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000,https://fintech-api-gateway-m2yl.onrender.com",
            ).split(",")
            if origin.strip()
        ]
        self.access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    def validate_production_invariants(self) -> List[str]:
        """
        Validates critical production security invariants.
        Returns a list of violation messages if any check fails.
        """
        violations: List[str] = []

        if self.profile == EnvironmentProfile.PRODUCTION:
            if self.secret_key == DEFAULT_INSECURE_SECRET or len(self.secret_key) < 32:
                violations.append("Production requires non-default SECRET_KEY with at least 32 characters")

            if self.n8n_api_key == DEFAULT_N8N_KEY:
                violations.append("Production requires unique, non-default N8N_API_KEY for M2M orchestration")

            if "*" in self.allowed_origins:
                violations.append("Wildcard CORS ('*') is strictly prohibited in PRODUCTION")

            is_cloud = not any(h in self.database_url for h in ("localhost", "127.0.0.1", "postgres:5432"))
            if is_cloud and "ssl" not in self.database_url.lower():
                violations.append("Production cloud database connection requires SSL/TLS encryption")

        return violations

    @property
    def is_production(self) -> bool:
        return self.profile == EnvironmentProfile.PRODUCTION

    @property
    def is_staging(self) -> bool:
        return self.profile == EnvironmentProfile.STAGING

    @property
    def is_development(self) -> bool:
        return self.profile == EnvironmentProfile.DEVELOPMENT


settings = Settings()
