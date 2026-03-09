# Sovereign Shield — Actionable Beta Tasks

This file converts the initial beta release plan into actionable, trackable tasks.

## Phase 1 — Core Engine Enhancement (Priority)
- [ ] Integrate quantized TinyML text classification models (ONNX)
- [ ] Add image classification models and image preprocessing
- [x] Model loader + caching (completed)
- [x] Model fallback and mock inference (completed)
- [ ] Implement robust model error handling & telemetry
- [ ] Add unit tests for model loader and inference

## Phase 1 — Threat Exchange
- [ ] Implement real cloud Threat Exchange API integration
- [x] Threat caching + local SQLite (completed)
- [x] Threat reporting with privacy-preserving fallback (completed)
- [ ] Add threat signature management and analytics endpoints

## Phase 1 — System Proxy
- [x] Basic HTTP proxy and content interception (completed)
- [ ] TLS termination / certificate management (MITM)
- [ ] Harden performance: connection pooling and keep-alive

## Phase 2 — Platform Apps
- [x] Desktop app: system proxy + tray + background service (completed)
- [ ] Desktop: packaging pipeline and installer
- [ ] Mobile: VPN / background processing (optional)

## Phase 3 — Production Infrastructure
- [ ] Backend: threat-exchange service, auth, rate-limiting
- [x] Containerization & k8s manifests (partial)
- [ ] CI/CD: tests, lint, release pipeline
- [ ] Load testing and performance tuning

## Phase 4 — Testing & QA
- [x] E2E tests (initial)
- [ ] Cross-platform compatibility tests
- [ ] Security scanning and remediation
- [ ] Beta UAT and feedback loop

## Next Immediate Actions (this session)
1. Create GitHub issues for the top 5 Phase-1 tasks.
2. Add a CI job to run `npm test` and `npm run lint` on PRs.
3. Start a small prototype to integrate ONNX model loader and add unit tests.

---

If you want, I can now:
- Create the GitHub issues (requires confirmation),
- Open PR(s) with the prototype integration changes using Aider to generate code, or
- Create CI config + pipeline files and commit them.

Tell me which of the immediate actions to perform next.