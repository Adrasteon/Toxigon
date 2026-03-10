#!/usr/bin/env bash
CERT_PATH=${1:-data/proxy-ca/ca.cert.pem}

if [ ! -f "$CERT_PATH" ]; then
  echo "Certificate file not found: $CERT_PATH" 1>&2
  exit 2
fi

OS=$(uname -s)
echo "Detected OS: $OS"

if [ "$OS" = "Darwin" ]; then
  echo "Installing CA into macOS System keychain (requires sudo)"
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_PATH"
  exit $?
fi

if [ "$OS" = "Linux" ]; then
  echo "Installing CA into system trust (requires sudo)"
  sudo cp "$CERT_PATH" /usr/local/share/ca-certificates/sovereign-shield-ca.crt || true
  if command -v update-ca-certificates >/dev/null 2>&1; then
    sudo update-ca-certificates
    exit $?
  fi
  if command -v update-ca-trust >/dev/null 2>&1; then
    sudo cp "$CERT_PATH" /etc/pki/ca-trust/source/anchors/sovereign-shield-ca.crt
    sudo update-ca-trust extract
    exit $?
  fi
  echo "Could not detect certificate update tool; please install the CA manually." 1>&2
  exit 3
fi

echo "Unsupported OS: $OS" 1>&2
exit 4
