"""
Build Script
============

Installs dependencies and builds the PWMS Notifier executable
using PyInstaller with ``--onedir`` mode for reliable CustomTkinter
bundling.

Usage::

    python build_exe.py

Output:
    ``dist/PWMS_Notifier/PWMS_Notifier.exe``
"""

import subprocess
import sys
import os


def _find_customtkinter_path() -> str:
    """Locate the installed customtkinter package directory.

    Returns:
        The absolute path to the ``customtkinter`` package.

    Raises:
        FileNotFoundError: If customtkinter is not installed.
    """
    try:
        import customtkinter
        return os.path.dirname(customtkinter.__file__)
    except ImportError:
        raise FileNotFoundError(
            "customtkinter is not installed. "
            "Run: pip install -r requirements.txt"
        )


def _cleanup_running_instance() -> None:
    """Attempt to kill any running PWMS_Notifier.exe process."""
    if sys.platform == "win32":
        print("\n[0/3] Stopping any running instances…")
        try:
            # We use taskkill to unlock the files in 'dist'
            subprocess.run(["taskkill", "/F", "/IM", "PWMS_Notifier.exe", "/T"], 
                           capture_output=True, check=False)
        except Exception:
            pass


def build() -> None:
    """Install requirements and build the executable."""
    print("=" * 50)
    print("  PWMS Notifier — Build Script")
    print("=" * 50)

    # Step 0: Cleanup
    _cleanup_running_instance()

    # Step 1: Install dependencies
    print("\n[1/3] Installing requirements…")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
    )

    # Step 2: Locate CustomTkinter assets
    print("\n[2/3] Locating CustomTkinter assets…")
    ctk_path = _find_customtkinter_path()
    print(f"  Found: {ctk_path}")

    # Step 3: Build with PyInstaller
    print("\n[3/3] Building executable with PyInstaller…")
    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onedir",
        "--noconsole",
        "--name", "PWMS_Notifier",
        # Bundle CustomTkinter assets
        "--add-data", f"{ctk_path};customtkinter/",
        # Bundle config.json alongside the exe
        "--add-data", "config.json;.",
        # Collect sub-packages
        "--collect-all", "plyer",
        "--collect-all", "pystray",
        "--collect-all", "notifier",  # Ensure our own package is fully included
        # Entry point
        "notifier_agent.py",
    ]
    subprocess.check_call(cmd)

    print("\n" + "=" * 50)
    print("  BUILD SUCCESSFUL!")
    print("  Output: dist/PWMS_Notifier/PWMS_Notifier.exe")
    print("=" * 50)


if __name__ == "__main__":
    build()
