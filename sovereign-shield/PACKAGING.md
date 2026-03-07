# Packaging and Deployment Notes

This document provides basic instructions for packaging the Sovereign Shield desktop application and installing the background service on Windows.

## Electron Packaging (Windows)

1. Use electron-builder with NSIS target. Install dependencies: `npm install --save-dev electron-builder nsis`
2. Add build configuration to package.json (example):

```json
"build": {
  "appId": "com.sovereign.shield",
  "productName": "Sovereign Shield",
  "files": ["dist/**/*","src/**/*","package.json"],
  "win": { "target": "nsis" }
}
```

3. Build: `npx electron-builder --windows nsis`

## Background Service (Windows)

Two helper scripts are provided under `src/scripts/` to create/remove a Windows service that runs the background Node script.

- `create_windows_service.bat` - creates a service named `SovereignShieldService` using the provided node executable path.
- `remove_windows_service.bat` - stops and deletes the service.

Example usage:

```
# From an elevated command prompt
src\\scripts\\create_windows_service.bat "%ProgramFiles%\\nodejs\\node.exe"

# To remove
src\\scripts\\remove_windows_service.bat
```

## Notes
- TLS termination / MITM requires generating and provisioning certificates; this is intentionally deferred to Phase 3.
- Packaging for macOS and Linux use platform-specific packaging tools (pkg, AppImage, etc.).
