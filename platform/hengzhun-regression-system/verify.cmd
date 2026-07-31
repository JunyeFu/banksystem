@echo off
call "%~dp0scripts\cmd-entry.cmd" VERIFY %*
exit /b %ERRORLEVEL%
