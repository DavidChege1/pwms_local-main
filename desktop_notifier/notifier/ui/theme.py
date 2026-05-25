"""
Theme Module
============

Centralised design tokens for the entire notifier UI.
Import colours, fonts, and spacing from here to maintain visual consistency
across all windows and dialogs.

Usage::

    from notifier.ui.theme import Colors, Fonts, Spacing

    label.configure(text_color=Colors.TEXT_PRIMARY)
"""

from __future__ import annotations


class Colors:
    """Application colour palette — dark-mode-first design."""

    # -- Backgrounds --------------------------------------------------------
    BG_PRIMARY = "#0f172a"          # Deep slate (main background)
    BG_SECONDARY = "#1e293b"        # Slightly lighter (panels)
    BG_CARD = "#1e293b"             # Card surfaces
    BG_CARD_HOVER = "#334155"       # Card hover highlight
    BG_HEADER = "#0f172a"           # Header bar
    BG_INPUT = "#1e293b"            # Entry / text box background

    # -- Accent -------------------------------------------------------------
    ACCENT = "#6366f1"              # Indigo — primary interactive colour
    ACCENT_HOVER = "#818cf8"        # Lighter indigo for hover states
    ACCENT_MUTED = "#312e81"        # Dark indigo for subtle backgrounds

    # -- Status badges ------------------------------------------------------
    SUCCESS = "#10b981"             # Green — APPROVED
    SUCCESS_BG = "#064e3b"          # Green badge background
    WARNING = "#f59e0b"             # Amber — PENDING
    WARNING_BG = "#78350f"          # Amber badge background
    DANGER = "#ef4444"              # Red — REJECTED
    DANGER_BG = "#7f1d1d"           # Red badge background
    INFO = "#3b82f6"                # Blue — informational
    CONNECTING = "#f59e0b"          # Amber — connecting state
    OFFLINE = "#ef4444"             # Red — offline state
    ONLINE = "#10b981"              # Green — online state

    # -- Text ---------------------------------------------------------------
    TEXT_PRIMARY = "#f1f5f9"        # Main text
    TEXT_SECONDARY = "#94a3b8"      # Muted / secondary text
    TEXT_HEADING = "#e2e8f0"        # Headings
    TEXT_ON_ACCENT = "#ffffff"      # Text on accent-coloured surfaces

    # -- Borders & Dividers -------------------------------------------------
    BORDER = "#334155"              # Subtle borders
    DIVIDER = "#1e293b"             # Horizontal dividers

    # -- Dialog-specific ----------------------------------------------------
    DIALOG_BG = "#1e293b"           # Dialog card background
    DIALOG_OVERLAY = "#0f172a"      # Behind-dialog overlay


class Fonts:
    """Font definitions using Segoe UI (ships with Windows)."""

    FAMILY = "Segoe UI"

    # Size / weight tuples for customtkinter widgets
    HEADING_XL = (FAMILY, 18, "bold")
    HEADING_LG = (FAMILY, 16, "bold")
    HEADING = (FAMILY, 14, "bold")
    HEADING_SM = (FAMILY, 12, "bold")
    BODY = (FAMILY, 11)
    BODY_BOLD = (FAMILY, 11, "bold")
    BODY_SM = (FAMILY, 10)
    CAPTION = (FAMILY, 9)
    CAPTION_BOLD = (FAMILY, 9, "bold")
    BADGE = (FAMILY, 9, "bold")
    MONO = ("Consolas", 10)


class Spacing:
    """Consistent spacing values (pixels)."""

    XS = 4
    SM = 8
    MD = 12
    LG = 16
    XL = 20
    XXL = 28
    CARD_PAD = 16       # Internal card padding
    SECTION_GAP = 24    # Gap between major sections

import customtkinter as ctk

def setup_theme() -> ctk.CTk:
    """Initialize CustomTkinter and return the root window."""
    ctk.set_appearance_mode("Dark")
    # We can use our custom colors or just the default dark mode
    root = ctk.CTk()
    return root
