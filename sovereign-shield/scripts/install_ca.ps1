param(
  [string]$CertPath = "data\proxy-ca\ca.cert.pem"
)

if (-not (Test-Path $CertPath)) {
  Write-Error "Certificate file not found: $CertPath"
  exit 2
}

Write-Host "Installing CA from $CertPath to Windows Trusted Root store (requires admin)..."

# Use certutil to add to Root store
& certutil -addstore -f "Root" $CertPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "certutil failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Certificate installed into Trusted Root."