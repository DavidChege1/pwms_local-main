@echo off
:: Navigate to the directory where this script is located
cd /d "%~dp0"

:: Check if .venv exists
if not exist ".venv\Scripts\activate" (
    echo [ERROR] Virtual environment not found. Please ensure Syncthing has finished syncing and you have created a .venv on the server. >> server_log.txt
    exit /b 1
)

echo [INFO] Starting PWMS Server at %date% %time% >> server_log.txt

:: Activate virtual environment, force UTF-8, and run the launcher
call .venv\Scripts\activate
set PYTHONUTF8=1
python start_project.py >> server_log.txt 2>&1
