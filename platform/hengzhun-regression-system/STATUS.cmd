@echo off
call "%~dp0scripts\cmd-entry.cmd" STATUS %*
exit /b %ERRORLEVEL%
