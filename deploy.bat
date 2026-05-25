@echo off
echo [DEPLOY] Starting PWMS Update...

:: 1. Navigate to project root
cd /d "%~dp0"

:: 2. Pull latest code from GitHub
echo [1/4] Syncing code from GitHub (main)...
git fetch origin main
git reset --hard origin/main

:: 3. Update Backend Environment
echo [2/4] Updating backend packages...
if exist ".venv\Scripts\activate" (
    call .venv\Scripts\activate
    pip install -r requirements.txt
)

:: 4. Build Frontend Assets
echo [3/4] Building frontend (Vite)...
cd frontend
call npm install
call npm run build
cd ..

:: 5. Restart via Task Scheduler
echo [4/4] Restarting services...
:: Command the task scheduler to stop and start the task
schtasks /end /tn "PWMS_Startup"
schtasks /run /tn "PWMS_Startup"

echo [DEPLOY] System updated and restarted successfully.
