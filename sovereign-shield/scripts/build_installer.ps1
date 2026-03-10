<#
Build helper for Windows using electron-builder.
Run from repo root: `powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1`
#>

Write-Host "Ensuring models directory exists..."
if (-not (Test-Path -Path "./models")) { New-Item -ItemType Directory -Path "./models" | Out-Null }

Write-Host "Installing optional packaging deps (if missing)..."
npm install --no-audit --no-fund --prefix "./sovereign-shield" electron-builder || Write-Host "electron-builder may already be present or install failed"

Write-Host "Running electron-builder..."
Push-Location "./sovereign-shield"
npx electron-builder --win --x64
Pop-Location

Write-Host "Build finished. Artifacts in sovereign-shield/dist_electron"
