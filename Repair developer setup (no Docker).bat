@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Repair Journalism Workbench developer setup (no Docker)
set "SETUP_LOG=journalism-workbench-setup.log"
set "PY="

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
where winget >nul 2>nul
if not %errorlevel%==0 goto :no_python
winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
if not %errorlevel%==0 goto :no_python
set "PY=py -3.12"

:python_ready
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3,12) else 1)" >nul 2>nul
  if not %errorlevel%==0 rmdir /s /q ".venv"
)
if not exist ".venv\Scripts\python.exe" %PY% -m venv .venv
if not %errorlevel%==0 goto :failed

echo Repair started %date% %time%> "%SETUP_LOG%"
".venv\Scripts\python.exe" -m pip install --upgrade pip >> "%SETUP_LOG%" 2>&1
if not %errorlevel%==0 goto :failed
".venv\Scripts\python.exe" -m pip install -r backend\requirements-local.txt >> "%SETUP_LOG%" 2>&1
if not %errorlevel%==0 goto :failed
rem The browser web capture drives (ADR-0018): its headless shell only, which makes no calls of its own.
".venv\Scripts\python.exe" -m playwright install --only-shell chromium >> "%SETUP_LOG%" 2>&1
if not %errorlevel%==0 goto :failed
rem The transcription model (ADR-0020), fetched once so reading a recording never downloads it.
pushd backend
"..\.venv\Scripts\python.exe" -m app.services.transcription fetch >> "..\%SETUP_LOG%" 2>&1
if not %errorlevel%==0 goto :failed
popd
rem The native module (ADR-0021) is built with Rust. Without it the app still runs; HEIC and RAW photos then say what to run.
set "VPY=.venv\Scripts\python.exe"
call :native_module
".venv\Scripts\python.exe" -c "import fastapi,uvicorn,sqlalchemy,httpx,followthemoney,multipart,pypdf,docx,alembic,fitz,openaleph_client,playwright,warcio,faster_whisper" >> "%SETUP_LOG%" 2>&1
if not %errorlevel%==0 goto :failed

del /q ".venv\.journalism_dependencies_ready_*" >nul 2>nul
type nul > ".venv\.journalism_dependencies_ready_1_27"
echo Runtime repair and import verification completed successfully.
exit /b 0

:no_python
echo Python 3.12 is required and could not be installed automatically.
exit /b 1

:failed
echo Journalism Workbench runtime repair failed.
echo Review %CD%\%SETUP_LOG% for the complete dependency error.
exit /b 1

:native_module
rem The Workbench's native module (backend\native, ADR-0021): code from the ArtCraft apps, built here with Rust.
rem It is optional: setup carries on without it, and a HEIC or RAW photo then says what to run.
where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust is not installed, so HEIC and RAW photos will not be read yet. Install it from https://rustup.rs and run setup again.
  exit /b 0
)
echo Building the native module; the first build takes several minutes...
"%VPY%" -m pip install .\backend\native >> "%SETUP_LOG%" 2>&1
if errorlevel 1 echo The native module did not build; the app runs without it. Details are in %SETUP_LOG%.
exit /b 0
