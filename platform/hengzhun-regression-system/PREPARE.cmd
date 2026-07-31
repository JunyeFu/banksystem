@echo off
call "%~dp0scripts\cmd-entry.cmd" PREPARE %*
exit /b %ERRORLEVEL%
