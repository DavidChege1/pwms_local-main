"""
PWMS Desktop Notifier
=====================

A real-time desktop notification agent for the Optimized Production
and Waste Management System (PWMS). Connects to the backend via WebSocket
to receive dispatch signals and present interactive approval dialogs
to SAP operators.

Modules:
    config      — Configuration loading and application constants
    logger      — Rotating file logger setup
    networking  — WebSocket listener and HTTP API client
    system      — Windows startup registration and single-instance mutex
    tray        — System tray icon management
    agent       — Main orchestrator that wires all components together
    ui          — CustomTkinter-based user interface package
"""

__version__ = "2.0.0"
__author__ = "PWMS Team"

from notifier.agent import NotifierAgent

__all__ = ["NotifierAgent", "__version__"]
