@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Stops the Docker stack if it is running, keeping all data (named volumes).
set "RUNNING="
where docker >nul 2>nul
if not errorlevel 1 (
  for /f "usebackq delims=" %%i in (`docker compose ps -q --status running 2^>nul`) do set "RUNNING=1"
)
if defined RUNNING (
  echo Stopping Journalism Workbench ^(Docker^)...
  docker compose stop
  echo Journalism Workbench stopped. Your data is kept.
  timeout /t 3 >nul
  exit /b 0
)

rem Otherwise stop developer mode ("Start without Docker (developer).bat"),
rem which runs the API directly on port 8000.
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>nul
echo Journalism Workbench stopped.
timeout /t 2 >nul
