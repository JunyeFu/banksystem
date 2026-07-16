@echo off
chcp 65001 >nul
setlocal

set "RUNTIME_ROOT=%~dp0"
set "NODE_HOME=%RUNTIME_ROOT%node-v20.20.2-win-x64"
set "PROJECT_ROOT=%RUNTIME_ROOT%.."

if not exist "%NODE_HOME%\node.exe" (
  echo BLOCKED_ENV_VERSION_DRIFT
  echo - Project-local Node.js v20.20.2 was not found: %NODE_HOME%\node.exe
  exit /b 2
)

set "DEMO_RUNTIME_ROOT=%RUNTIME_ROOT%"
set "NODE_PATH=%RUNTIME_ROOT%node_modules"
set "PLAYWRIGHT_BROWSERS_PATH=%RUNTIME_ROOT%browsers"
set "MIDSCENE_RUN_DIR=%PROJECT_ROOT%\.data\midscene-runs"
set "PATH=%NODE_HOME%;%RUNTIME_ROOT%node_modules\.bin;%PATH%"
cd /d "%PROJECT_ROOT%"
cmd /k
