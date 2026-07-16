@echo off
setlocal

set "RUNTIME_ROOT=%~dp0"
set "NODE_HOME=%RUNTIME_ROOT%node-v20.20.2-win-x64"

if not exist "%NODE_HOME%\node.exe" (
  echo BLOCKED_ENV_VERSION_DRIFT
  echo - Project-local Node.js v20.20.2 was not found: %NODE_HOME%\node.exe
  exit /b 2
)

set "DEMO_RUNTIME_ROOT=%RUNTIME_ROOT%"
"%NODE_HOME%\node.exe" "%~dp0..\scripts\verify-demo-runtime-freeze.cjs"
exit /b %ERRORLEVEL%
