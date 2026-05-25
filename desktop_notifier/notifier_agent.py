"""
Backwards-Compatible Entry Point
=================================

This shim preserves the original ``python notifier_agent.py`` command
so that existing shortcuts, PyInstaller specs, and startup registry
entries continue to work after the refactor.

All logic has moved to the ``notifier`` package.
"""

from notifier.__main__ import main

if __name__ == "__main__":
    main()
