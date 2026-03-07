# Testing Guide

This file describes how to run unit and integration tests locally.

Prerequisites:
- Node.js 18+
- npm

Run all tests:

```
npm ci
npm test
```

Integration test notes:
- Integration tests start a local instance of the Sovereign Shield API on an ephemeral port and run basic endpoint checks (health and filter).
- Tests may take up to 30 seconds due to component initialization (model loader, DB init).

Manual perf testing:
- Use `scripts/perf_test.sh` to run a simple 100-request test against the filter endpoint.

Background service tests:
- Start the Electron app (`npm run electron:dev`) or run the background service directly with Node:

```
node src/ui/backgroundService.js
```

CI:
- GitHub Actions runs lint and tests automatically on push / PR to main.
