@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Repair Journalism Workbench DEV 1.24
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
".venv\Scripts\python.exe" -c "import fastapi,uvicorn,sqlalchemy,httpx,followthemoney,multipart,pypdf,docx,alembic,fitz,openaleph_client" >> "%SETUP_LOG%" 2>&1
if not %errorlevel%==0 goto :failed

del /q ".venv\.journalism_dependencies_ready_*" >nul 2>nul
type nul > ".venv\.journalism_dependencies_ready_1_24"
echo Runtime repair and import verification completed successfully.
exit /b 0

:no_python
echo Python 3.12 is required and could not be installed automatically.
exit /b 1

:failed
echo Journalism Workbench runtime repair failed.
echo Review %CD%\%SETUP_LOG% for the complete dependency error.
exit /b 1
