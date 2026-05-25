"""
System Utilities
================

Windows-specific helpers for:

* **Auto-start registration** — adds the application to the
  ``HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`` registry key
  so it launches automatically when the user logs in.

* **Single-instance mutex** — prevents multiple copies of the notifier
  from running simultaneously on the same machine.

Both features degrade gracefully when ``pywin32`` is not installed
(e.g. during development on non-Windows platforms).
"""

from __future__ import annotations

import os
import sys
import tkinter as tk
from tkinter import messagebox
from typing import Any, Optional

from notifier.config import APP_NAME, BASE_DIR
from notifier.logger import log

# ---------------------------------------------------------------------------
# Optional pywin32 imports
# ---------------------------------------------------------------------------

try:
    import win32event
    import win32api
    import winerror

    _HAS_WIN32 = True
except ImportError:
    win32event = None  # type: ignore[assignment]
    win32api = None    # type: ignore[assignment]
    winerror = None    # type: ignore[assignment]
    _HAS_WIN32 = False

try:
    import winreg

    _HAS_WINREG = True
except ImportError:
    winreg = None  # type: ignore[assignment]
    _HAS_WINREG = False


# ---------------------------------------------------------------------------
# Auto-Start Registration
# ---------------------------------------------------------------------------

def register_startup(app_name: str = APP_NAME) -> bool:
    """Register the application to start automatically on Windows login.

    Writes a ``REG_SZ`` value under
    ``HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run``
    pointing to the current executable (frozen) or the Python script
    (development).

    Args:
        app_name: The registry value name.  Defaults to :data:`APP_NAME`.

    Returns:
        ``True`` if registration succeeded, ``False`` otherwise.
    """
    if not _HAS_WINREG:
        log.warning("winreg not available — skipping startup registration.")
        return False

    try:
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE
        )

        if getattr(sys, "frozen", False):
            # Frozen .exe — register the executable directly
            cmd = sys.executable
        else:
            # Development — register the shim entry point via Python
            entry_point = os.path.join(BASE_DIR, "notifier_agent.py")
            cmd = f'"{sys.executable}" "{entry_point}"'

        winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, cmd)
        winreg.CloseKey(key)
        log.info("Registered for startup: %s → %s", app_name, cmd)
        return True
    except OSError as exc:
        log.error("Failed to register startup: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Single-Instance Mutex
# ---------------------------------------------------------------------------

_MUTEX_NAME: str = "Global\\PWMS_Dispatch_Notifier_Mutex"


def check_single_instance(mutex_name: str = _MUTEX_NAME) -> Optional[Any]:
    """Ensure only one instance of the notifier is running.

    Creates a named Windows mutex.  If the mutex already exists (another
    instance owns it), a warning dialog is shown and the process exits.

    Args:
        mutex_name: The global mutex name.

    Returns:
        The mutex handle (must be kept alive for the process lifetime),
        or ``None`` if ``pywin32`` is unavailable.
    """
    if not _HAS_WIN32:
        log.warning("pywin32 not available — skipping single-instance check.")
        return None

    mutex = win32event.CreateMutex(None, False, mutex_name)
    last_error = win32api.GetLastError()

    if last_error == winerror.ERROR_ALREADY_EXISTS:
        log.warning("Another instance is already running. Exiting.")
        root = tk.Tk()
        root.withdraw()
        messagebox.showwarning(
            "Already Running",
            f"{APP_NAME} is already running in the background.",
        )
        sys.exit(0)

    log.info("Single-instance mutex acquired: %s", mutex_name)
    return mutex  # prevent garbage collection
