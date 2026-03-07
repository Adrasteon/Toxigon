@echo off
REM Remove Windows service created for Sovereign Shield
sc stop SovereignShieldService >nul 2>&1
sc delete SovereignShieldService >nul 2>&1
echo Service removed (if it existed)
