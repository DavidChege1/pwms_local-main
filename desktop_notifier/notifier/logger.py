"""
Logging Module
==============

Sets up a rotating file logger so that debug information is always
available for troubleshooting without consuming unbounded disk space.

The log file (``notifier_debug.log``) is created in the same directory
as the executable or source root.

Rotation policy:
    * Max 10 MB per log file
    * 3 backup files kept (``*.log.1``, ``*.log.2``, ``*.log.3``)
    * Total worst-case disk usage: ~40 MB
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler

from notifier.config import BASE_DIR, PC_NAME

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LOG_FILE: str = os.path.join(BASE_DIR, "notifier_debug.log")
MAX_BYTES: int = 10 * 1024 * 1024  # 10 MB
BACKUP_COUNT: int = 3
LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure and return the application-wide logger.

    Args:
        level: The minimum severity to capture (default ``INFO``).

    Returns:
        A ``logging.Logger`` instance named ``"pwms_notifier"``.
    """
    logger = logging.getLogger("pwms_notifier")
    logger.setLevel(level)

    # Avoid adding duplicate handlers if called more than once
    if not logger.handlers:
        handler = RotatingFileHandler(
            LOG_FILE,
            maxBytes=MAX_BYTES,
            backupCount=BACKUP_COUNT,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter(LOG_FORMAT))
        logger.addHandler(handler)

        # Also log to stderr during development
        console = logging.StreamHandler()
        console.setFormatter(logging.Formatter(LOG_FORMAT))
        logger.addHandler(console)

    logger.info("--- Notifier Started (PC: %s) ---", PC_NAME)
    return logger


# Module-level convenience logger
log: logging.Logger = setup_logging()
"""Pre-configured logger.  Import as ``from notifier.logger import log``."""
