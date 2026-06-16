@echo off
setlocal EnableExtensions

echo Starting MixLab Windows Test Runner...

set "SHARE_ROOT=%~dp0"
if "%SHARE_ROOT:~-1%"=="\" set "SHARE_ROOT=%SHARE_ROOT:~0,-1%"
set "RUNNER_SOURCE=%SHARE_ROOT%\runner\MixLabWindowsTestRunner.exe"
set "RUNNER_MANIFEST=%SHARE_ROOT%\runner\latest.json"
set "LOCAL_RUNNER_DIR=%LOCALAPPDATA%\MixLab\TestRunner"
set "LOCAL_RUNNER=%LOCAL_RUNNER_DIR%\MixLabWindowsTestRunner.exe"
set "RUNNER_LOG_DIR=%SHARE_ROOT%\logs\runner"
set "BOOT_LOG=%RUNNER_LOG_DIR%\bootstrap.log"

echo Share root: %SHARE_ROOT%

if not exist "%RUNNER_SOURCE%" (
  echo Missing runner executable:
  echo %RUNNER_SOURCE%
  pause
  exit /b 1
)

if not exist "%LOCAL_RUNNER_DIR%" mkdir "%LOCAL_RUNNER_DIR%"
if errorlevel 1 (
  echo Failed to create local runner folder:
  echo %LOCAL_RUNNER_DIR%
  pause
  exit /b 1
)

copy /Y "%RUNNER_SOURCE%" "%LOCAL_RUNNER%" >nul
if errorlevel 1 (
  echo Failed to copy runner to local cache.
  pause
  exit /b 1
)

if exist "%RUNNER_MANIFEST%" copy /Y "%RUNNER_MANIFEST%" "%LOCAL_RUNNER_DIR%\latest.json" >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%LOCAL_RUNNER%' -ErrorAction SilentlyContinue" >nul 2>nul

if not exist "%RUNNER_LOG_DIR%" mkdir "%RUNNER_LOG_DIR%"

set "MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT=%SHARE_ROOT%"
set "MIXLAB_WINDOWS_BUILDS_ROOT=%SHARE_ROOT%"
set "MIXLAB_WINDOWS_TEST_RUNNER_HOST=0.0.0.0"
set "MIXLAB_WINDOWS_TEST_RUNNER_PORT=3799"

echo Local runner: %LOCAL_RUNNER%
echo Health URL: http://127.0.0.1:3799/health
echo Bootstrap log: %BOOT_LOG%
echo.
echo The runner will now start in this window. Keep this window open while Codex runs Windows tests.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT='%SHARE_ROOT%'; $env:MIXLAB_WINDOWS_BUILDS_ROOT='%SHARE_ROOT%'; $env:MIXLAB_WINDOWS_TEST_RUNNER_HOST='0.0.0.0'; $env:MIXLAB_WINDOWS_TEST_RUNNER_PORT='3799'; & '%LOCAL_RUNNER%' 2>&1 | Tee-Object -FilePath '%BOOT_LOG%' -Append; exit $LASTEXITCODE"

echo.
echo Runner exited with code %ERRORLEVEL%.
pause
