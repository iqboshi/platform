@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

title Platform Frontend

if not exist "node_modules" (
  echo [ERROR] node_modules not found.
  echo Please run:
  echo   npm install
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  pause
  exit /b 1
)

set "VITE_API_BASE_URL=http://127.0.0.1:8002/api/v1"
set "VITE_TILE_BASE_URL=http://127.0.0.1:8002/tiles"

echo Starting frontend on http://127.0.0.1:5178
call npm run dev --workspace @platform/web -- --host 127.0.0.1 --port 5178

if errorlevel 1 (
  echo.
  echo [ERROR] Frontend failed to start.
  pause
)

endlocal
