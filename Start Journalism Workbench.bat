@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Journalism Workbench DEV 1.24

set "PY="
set "RUNTIME_MARKER=.venv\.journalism_dependencies_ready_1_24"
set "SETUP_LOG=journalism-workbench-setup.log"

echo ============================================================
echo   Journalism Workbench DEV 1.24 - Local Launcher
echo ============================================================
echo.

rem The application is developed/tested on Python 3.12.  Do not use
rem "py -3" here: on machines with Python 3.13 installed it selects 3.13
rem and can force native dependencies down an unsupported build path.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3.12 -c "import sys; assert sys.version_info[:2] == (3,12)" >nul 2>nul
  if %errorlevel%==0 set "PY=py -3.12"
)

if defined PY goto :python_ready

where python >nul 2>nul
if %errorlevel%==0 (
  python -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3,12) else 1)" >nul 2>nul
  if %errorlevel%==0 set "PY=python"
)

if defined PY goto :python_ready

echo Python 3.12 was not found.
where winget >nul 2>nul
if not %errorlevel%==0 goto :no_python

echo Installing Python 3.12 using Windows Package Manager...
winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
if not %errorlevel%==0 goto :no_python
set "PY=py -3.12"
%PY% -c "import sys; assert sys.version_info[:2] == (3,12)" >nul 2>nul
if not %errorlevel%==0 goto :no_python

:python_ready
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3,12) else 1)" >nul 2>nul
  if not %errorlevel%==0 (
    echo Existing private environment uses the wrong Python version. Rebuilding it...
    rmdir /s /q ".venv"
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating private Python 3.12 environment...
  %PY% -m venv .venv
  if not %errorlevel%==0 goto :failed
)

set "VPY=.venv\Scripts\python.exe"

rem A versioned marker prevents an old DEV environment from silently skipping
rem dependencies added by newer source snapshots.
if not exist "%RUNTIME_MARKER%" (
  echo Installing/updating Journalism Workbench dependencies...
  echo Setup started %date% %time%> "%SETUP_LOG%"
  "%VPY%" -m pip install --upgrade pip >> "%SETUP_LOG%" 2>&1
  if not %errorlevel%==0 goto :dependency_failed
  "%VPY%" -m pip install -r backend\requirements-local.txt >> "%SETUP_LOG%" 2>&1
  if not %errorlevel%==0 goto :dependency_failed
)

rem Never trust the marker alone. Verify imports needed by the actual local
rem application before declaring setup complete.
"%VPY%" -c "import fastapi,uvicorn,sqlalchemy,httpx,followthemoney,multipart,pypdf,docx,alembic,fitz,openaleph_client" >nul 2>> "%SETUP_LOG%"
if not %errorlevel%==0 goto :dependency_failed
if not exist "%RUNTIME_MARKER%" type nul > "%RUNTIME_MARKER%"

if not exist "backend\.env" (
  echo DATABASE_URL=sqlite:///./journalism.db> backend\.env
  echo ALEPH_BASE_URL=https://aleph.occrp.org>> backend\.env
  echo ALEPH_API_KEY=>> backend\.env
  echo OPENSANCTIONS_BASE_URL=https://api.opensanctions.org>> backend\.env
  echo OPENSANCTIONS_API_KEY=>> backend\.env
  echo OPENSANCTIONS_DATASET=default>> backend\.env
  echo OPENSANCTIONS_SEARCH_LIMIT=20>> backend\.env
  rem Operator console (ADR-0003): local desktop use is a trusted single operator,
  rem so allow reviewed changeset writes from the backend console out of the box.
  echo CONSOLE_WRITES=changesets>> backend\.env
)

rem Use the Docker Postgres database when the workbench-db container is running, so
rem what you do in the app is visible in Adminer (http://127.0.0.1:8081) and matches
rem the Docker stack. An environment variable beats backend\.env for pydantic-settings,
rem so the .env file is left untouched. Without Docker this falls back to SQLite; the
rem backend console (http://127.0.0.1:8000/console) can browse that too.
set "WORKBENCH_DB=SQLite file backend\journalism.db (Adminer cannot open it; use the backend console)"
set "WB_DB_CID="
where docker >nul 2>&1
if %errorlevel%==0 (
  for /f "usebackq delims=" %%i in (`docker compose ps -q --status running workbench-db 2^>nul`) do set "WB_DB_CID=%%i"
)
if not defined POSTGRES_PASSWORD set "POSTGRES_PASSWORD=journalism-local-dev"
if defined WB_DB_CID (
  set "DATABASE_URL=postgresql+psycopg://journalism:%POSTGRES_PASSWORD%@127.0.0.1:5432/journalism"
  set "WORKBENCH_DB=Docker Postgres workbench-db (Adminer: http://127.0.0.1:8081)"
)

echo.
echo Starting Journalism Workbench DEV 1.24...
echo Database: %WORKBENCH_DB%
echo Browser: http://127.0.0.1:8000
echo Backend console: http://127.0.0.1:8000/console   API docs: http://127.0.0.1:8000/docs
echo.
cd backend
"..\.venv\Scripts\python.exe" launch_local.py
if not %errorlevel%==0 goto :runtime_failed
exit /b 0

:dependency_failed
echo.
echo Dependency setup failed. The full error is saved in:
echo   %CD%\%SETUP_LOG%
echo.
echo Run "Repair Journalism Workbench.bat" after checking your internet connection.
pause
exit /b 1

:runtime_failed
echo.
echo Journalism Workbench installed, but the application failed to start.
echo The Python traceback above identifies the startup failure.
pause
exit /b 1

:no_python
echo Python 3.12 is required and could not be installed automatically.
echo Install Python 3.12, then run this launcher again.
pause
exit /b 1

:failed
echo Setup failed before dependency installation.
pause
exit /b 1
