@echo off
REM Create Windows service to run the background Node script
SETLOCAL

if "%~1"=="" (
  where node >nul 2>&1 || (
    echo Node not found in PATH. Provide path to node.exe as first argument.
    exit /b 1
  )
  for /f "delims=" %%i in ('where node') do set "NODE_PATH=%%i" & goto :foundnode
) else (
  set "NODE_PATH=%~1"
)
:foundnode

set "SCRIPT=%~dp0\..\ui\backgroundService.js"
sc create SovereignShieldService binPath= ""%NODE_PATH%" "%SCRIPT%"" start= auto
sc description SovereignShieldService "Sovereign Shield background service"
echo Service created. To start it run: sc start SovereignShieldService
ENDLOCAL
