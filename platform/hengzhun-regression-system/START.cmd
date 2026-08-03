@echo off
call "%~dp0scripts\cmd-entry.cmd" START %*
exit /b %ERRORLEVEL%
