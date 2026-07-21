@echo off
chcp 65001 >nul
setlocal

set "PRODUCT_ROOT=%~dp0"
set "NODE=%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\node.exe"

if not exist "%NODE%" (
  echo BLOCKED_ENV_VERSION_DRIFT
  echo - Product-local Node.js v20.20.2 was not found.
  exit /b 2
)

if not exist "%PRODUCT_ROOT%.data" mkdir "%PRODUCT_ROOT%.data"

"%NODE%" "%PRODUCT_ROOT%scripts\verify-structure.cjs"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\verify-runtime.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NODE%" --test "%PRODUCT_ROOT%tests\conformance\conformance-server.test.cjs"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NODE%" "%PRODUCT_ROOT%scripts\verify-i1-artifacts.cjs"
if errorlevel 1 exit /b %ERRORLEVEL%

"%NODE%" "%PRODUCT_ROOT%scripts\verify-i1-results.cjs"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run verify:i2
if errorlevel 1 exit /b %ERRORLEVEL%

"%NODE%" "%PRODUCT_ROOT%scripts\verify-i2-results.cjs"
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run verify:i3
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run test:i4
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run verify:i4:results
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run test:i5
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run verify:i5:results
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run test:i6
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run test:i7
if errorlevel 1 exit /b %ERRORLEVEL%

"%NODE%" "%PRODUCT_ROOT%scripts\verify-i7-delivery.cjs" --check
if errorlevel 1 exit /b %ERRORLEVEL%

call "%PRODUCT_ROOT%runtime\node-v20.20.2-win-x64\npm.cmd" run verify:i8:stage7
if errorlevel 1 exit /b %ERRORLEVEL%

echo HENGZHUN_I1_I2_I3_I4_I5_I6_I7_AND_I8_STAGE7_VERIFIED
exit /b 0
