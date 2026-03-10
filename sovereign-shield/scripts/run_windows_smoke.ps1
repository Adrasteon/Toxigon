param(
  [string]$UnpackedDir
)

# Find unpacked app directory if not provided
if (-not $UnpackedDir) {
  $base = Join-Path -Path (Resolve-Path .).Path -ChildPath "dist_electron"
  $dirs = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*-win-unpacked" }
  if ($dirs.Count -eq 0) {
    Write-Error "No win-unpacked directory found under $base"
    exit 2
  }
  $UnpackedDir = $dirs[0].FullName
}

$exe = Join-Path $UnpackedDir "Sovereign Shield.exe"
if (-not (Test-Path $exe)) {
  Write-Error "Executable not found at $exe"
  exit 3
}

Write-Host "Starting app from: $exe"
$proc = Start-Process -FilePath $exe -ArgumentList "--no-sandbox" -PassThru

# Wait for health endpoint
$healthUrl = 'http://localhost:3000/health'
$deadline = (Get-Date).AddSeconds(30)
$ok = $false
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $ok = $true; break }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if ($ok) {
  Write-Host "Health check OK"
  # cleanup
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  exit 0
} else {
  Write-Error "Health check failed"
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  exit 4
}
