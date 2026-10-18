@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Journalism Workbench

echo ============================================================
echo   Journalism Workbench
echo ============================================================
echo.

rem The product is the Docker stack: the Workbench, its PostgreSQL database and
rem OpenAleph (docs\adr\0004). This starts all of it and opens the workbench.

where docker >nul 2>nul
if errorlevel 1 goto :no_docker
docker info >nul 2>nul
if errorlevel 1 goto :docker_not_running

echo Starting the Workbench and OpenAleph...
echo The first start downloads and builds everything and can take 10 minutes or more.
echo.
docker compose up --build -d
if errorlevel 1 goto :failed

echo.
echo Waiting for the Workbench to report healthy...
rem A second "up" starts nothing new; --wait returns once the backend container's
rem health check passes. OpenAleph may still be starting; the Workbench opens
rem without it and shows OpenAleph as down until it is ready.
docker compose up -d --wait --wait-timeout 300 backend
if errorlevel 1 goto :slow

start "" http://127.0.0.1:8000
echo.
echo Journalism Workbench is running:
echo   Workbench        http://127.0.0.1:8000
echo   Backend console  http://127.0.0.1:8000/console
echo   OpenAleph        http://127.0.0.1:8080
echo   Database editor  http://127.0.0.1:8081  (Adminer)
echo.
echo Close this window any time; the app keeps running.
echo Use "Stop Journalism Workbench.bat" to stop it.
timeout /t 10 >nul
exit /b 0

:no_docker
echo Docker Desktop is not installed.
echo Install it from https://www.docker.com/products/docker-desktop/ and run this again.
echo.
echo Developers can run the API alone, without OpenAleph, with
echo "Start without Docker (developer).bat".
pause
exit /b 1

:docker_not_running
echo Docker Desktop is installed but not running.
echo Start Docker Desktop, wait until it says "Engine running", then run this again.
pause
exit /b 1

:slow
echo.
echo The Workbench did not report healthy within 5 minutes.
echo See what it is doing with:  docker compose logs backend
pause
exit /b 1

:failed
echo.
echo Docker could not start the app. The messages above say why.
echo Common causes: Docker Desktop still starting, or ports 8000, 8001, 8080 or 8081 already in use.
pause
exit /b 1
