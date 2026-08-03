@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

set "_script_dir=%~dp0"
set "_operation=%~1"
if not defined _operation goto :usage
shift

set "HENGZHUN_PROGRESS=1"
set "HENGZHUN_RESUME_MODE=auto"
if not defined HENGZHUN_HEARTBEAT_SECONDS set "HENGZHUN_HEARTBEAT_SECONDS=10"
set "_no_pause=0"

:parse
if "%~1"=="" goto :dispatch
if /i "%~1"=="--restart" (
  set "HENGZHUN_RESUME_MODE=restart"
  shift
  goto :parse
)
if /i "%~1"=="--no-pause" (
  set "_no_pause=1"
  shift
  goto :parse
)
echo [CMD] 未知参数：%~1 1>&2
goto :usage_error

:dispatch
if /i "%_operation%"=="VERIFY" (
  "%_script_dir%..\runtime\node-v20.20.2-win-x64\node.exe" "%_script_dir%i10-stage9-portable.cjs" verify --candidate "%_script_dir%.." --progress
  goto :complete
)
if /i "%_operation%"=="PREPARE" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%_script_dir%prepare-i10.ps1"
  goto :complete
)
if /i "%_operation%"=="START" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%_script_dir%start-i10.ps1"
  goto :complete
)
if /i "%_operation%"=="STATUS" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%_script_dir%status-i10.ps1"
  goto :complete
)
if /i "%_operation%"=="STOP" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%_script_dir%stop-i10.ps1"
  goto :complete
)
goto :usage_error

:complete
set "_exit_code=%ERRORLEVEL%"
if not "%_exit_code%"=="0" exit /b %_exit_code%
if "%_no_pause%"=="1" exit /b 0
if "%HENGZHUN_NONINTERACTIVE%"=="1" exit /b 0
echo.
echo [%_operation%] 操作成功。按任意键关闭窗口……
pause >nul
exit /b 0

:usage
echo 用法：cmd-entry.cmd VERIFY^|PREPARE^|START^|STATUS^|STOP [--restart] [--no-pause] 1>&2
exit /b 64

:usage_error
echo 用法：%_operation%.cmd [--restart] [--no-pause] 1>&2
exit /b 64
