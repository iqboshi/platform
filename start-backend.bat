@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

title Platform Backend

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Python virtual environment not found: .venv\Scripts\python.exe
  echo Please create it first with:
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -e .\backend[dev]
  pause
  exit /b 1
)

set "PLATFORM_ENV=development"
set "PLATFORM_TILE_BASE_URL=http://127.0.0.1:8010/tiles"
set "PLATFORM_GEE_REQUEST_TIMEOUT_SECONDS=20"
set "PLATFORM_GEE_MAX_RETRIES=1"

if not defined HTTP_PROXY set "HTTP_PROXY=http://127.0.0.1:7897"
if not defined HTTPS_PROXY set "HTTPS_PROXY=http://127.0.0.1:7897"
if not defined PLATFORM_HTTP_PROXY set "PLATFORM_HTTP_PROXY=%HTTP_PROXY%"
if not defined PLATFORM_HTTPS_PROXY set "PLATFORM_HTTPS_PROXY=%HTTPS_PROXY%"

echo Starting backend on http://127.0.0.1:8010
".venv\Scripts\python.exe" -m uvicorn platform_backend.main:app --app-dir ".\backend\src" --host 127.0.0.1 --port 8010

if errorlevel 1 (
  echo.
  echo [ERROR] Backend failed to start.
  pause
)

endlocal
