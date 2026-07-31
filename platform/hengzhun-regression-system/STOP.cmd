@echo off
call "%~dp0scripts\cmd-entry.cmd" STOP %*
exit /b %ERRORLEVEL%
