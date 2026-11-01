# app/core/logging_config.py
"""
Centralised Logging Configuration
-----------------------------------
Provides a single canonical helper for obtaining a consistently formatted
logger across all backend modules.

Usage:
    from app.core.logging_config import get_logger
    logger = get_logger(__name__, context_tag="CONSUMER")

Level Control:
    Set the LOG_LEVEL environment variable (default: INFO).
    Valid values: DEBUG | INFO | WARNING | ERROR | CRITICAL
"""

import logging
import os


def get_logger(name: str, context_tag: str = "") -> logging.Logger:
    """
    Returns a consistently configured logger.

    Args:
        name:        Module name — use __name__ for standard Python conventions.
        context_tag: Optional bracket label appended to the format prefix.
                     e.g. context_tag="CONSUMER" → [CONSUMER] in log lines.

    Returns:
        A stdlib Logger instance bound to `name`.
    """
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    tag_segment = f"[{context_tag}] " if context_tag else ""
    fmt = f"%(asctime)s [%(levelname)s] {tag_segment}%(message)s"

    # basicConfig is idempotent after the root handler is configured.
    # Individual modules calling this will safely inherit the root level.
    logging.basicConfig(level=level, format=fmt)

    return logging.getLogger(name)
