"""
App Module
==========

Configures the root ``customtkinter.CTk`` window and sets the global
appearance mode to dark.

This module is the first UI component initialised; all other windows
(main_window, dialogs) are ``CTkToplevel`` children of the root.
"""

from __future__ import annotations

import customtkinter as ctk

from notifier.config import APP_NAME


def create_root() -> ctk.CTk:
    """Create, configure, and return the hidden root window.

    The root window is immediately withdrawn (hidden) because the
    user-facing interface is a ``CTkToplevel`` managed by
    :mod:`notifier.ui.main_window`.  The root serves only as the
    Tk event-loop anchor.

    Returns:
        A configured ``CTk`` instance with the event loop ready.
    """
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")

    root = ctk.CTk()
    root.title(APP_NAME)
    root.withdraw()  # Hidden — the main window is a Toplevel

    return root
