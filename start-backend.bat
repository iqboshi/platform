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
set "PLATFORM_TILE_BASE_URL=http://127.0.0.1:8002/tiles"

echo Starting backend on http://127.0.0.1:8002
".venv\Scripts\python.exe" -m uvicorn platform_backend.main:app --app-dir ".\backend\src" --reload --host 127.0.0.1 --port 8002

if errorlevel 1 (
  echo.
  echo [ERROR] Backend failed to start.
  pause
)

endlocal
