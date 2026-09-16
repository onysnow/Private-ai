@echo off
cd /d "%~dp0"
where docker >nul 2>nul
if not %errorlevel%==0 (
  echo Docker was not found. Use Start Journalism Workbench.bat for the standalone local version.
  pause
  exit /b 1
)
docker compose up --build -d
if not %errorlevel%==0 (
  echo Docker could not start the app. Make sure Docker Desktop is running.
  pause
  exit /b 1
)
start http://localhost:3000
