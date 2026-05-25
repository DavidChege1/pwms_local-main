"""
Configuration Module
====================

Loads application settings from ``config.json`` located next to the
executable (frozen) or next to this source file (development).

If the file is missing, a default one is created automatically.

Configuration keys:
    server_ip   — IP or hostname of the PWMS backend server
    server_port — Port the backend API listens on
    app_name    — Display name used in Windows notifications & tray
"""

from __future__ import annotations

import json
import os
import platform
import sys
from typing import Any, Dict

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

_DEFAULTS: Dict[str, Any] = {
    "server_ip": "127.0.0.1",
    "server_port": "9092",
    "app_name": "PWMS Dispatch Notifier",
}


# ---------------------------------------------------------------------------
# Path Resolution
# ---------------------------------------------------------------------------

def _get_base_dir() -> str:
    """Return the directory that contains the running executable or script.

    When packaged with PyInstaller (``sys.frozen == True``), this is the
    folder containing the ``.exe``.  In development it is the directory
    of *this* source file's parent (``desktop_notifier/``).
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    # In dev, config.json lives in desktop_notifier/ (one level up from notifier/)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


BASE_DIR: str = _get_base_dir()
"""Absolute path to the application root directory."""


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

def load_config() -> Dict[str, Any]:
    """Read ``config.json`` and merge with defaults.

    Returns:
        A dictionary with at least the keys defined in ``_DEFAULTS``.
        User-specified values override defaults.
    """
    config_path = os.path.join(BASE_DIR, "config.json")

    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as fh:
                user_config = json.load(fh)
            return {**_DEFAULTS, **user_config}
        except (json.JSONDecodeError, OSError):
            return dict(_DEFAULTS)
    else:
        # First run — create a default config for the user to edit
        try:
            with open(config_path, "w", encoding="utf-8") as fh:
                json.dump(_DEFAULTS, fh, indent=4)
        except OSError:
            pass
        return dict(_DEFAULTS)


# ---------------------------------------------------------------------------
# Derived Constants (module-level singletons)
# ---------------------------------------------------------------------------

config: Dict[str, Any] = load_config()
"""The active configuration dictionary."""

API_BASE_URL: str = (
    f"http://{config['server_ip']}:{config['server_port']}/api/notifications"
)
"""Base URL for the notification REST API."""

# Resolve ``localhost`` → ``127.0.0.1`` to avoid WS DNS hiccups on Windows.
_ws_ip: str = (
    "127.0.0.1"
    if config["server_ip"].lower() == "localhost"
    else config["server_ip"]
)

WS_URL: str = (
    f"ws://{_ws_ip}:{config['server_port']}/api/notifications/ws/dispatch"
)
"""Primary WebSocket URL for real-time dispatch events."""

WS_URL_FALLBACK: str = (
    f"ws://{_ws_ip}:{config['server_port']}/ws/dispatch"
)
"""Fallback WebSocket URL (top-level path without ``/api/notifications``)."""

APP_NAME: str = config["app_name"]
"""Display name for the application (tray, notifications, registry)."""

PC_NAME: str = platform.node()
"""Hostname of the machine running this notifier instance."""
