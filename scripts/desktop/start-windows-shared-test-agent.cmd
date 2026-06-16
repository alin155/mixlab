@echo off
setlocal

title MixLab Windows Shared Test Agent
echo Starting MixLab Windows shared test agent watchdog...
echo.

pushd "%~dp0"
if errorlevel 1 (
  echo Failed to enter shared folder:
  echo %~dp0
  echo.
  pause
  exit /b 1
)

set "SHARE_ROOT=%CD%"

echo Share root: %SHARE_ROOT%
echo The watchdog will print its version and keep the agent running.
echo Keep this window open. The watchdog restarts the agent if it exits.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\windows-shared-agent-watchdog.ps1" -ShareRoot "%SHARE_ROOT%" -StopExistingProcesses
set "EXIT_CODE=%ERRORLEVEL%"

popd

echo.
echo MixLab Windows shared test agent watchdog exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
