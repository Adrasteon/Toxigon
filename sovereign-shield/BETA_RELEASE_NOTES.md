# Initial Beta Release Notes

Version: 0.1.0-beta

Highlights:
- Core Engine: model loader with caching and mock fallback
- Local Threat Exchange: SQLite caching, offline-safe reporting
- System Proxy: HTTP proxy with CONNECT tunneling, content interception
- Desktop App: Electron scaffold, background service, auto-start helper, policy UI
- Infrastructure: Dockerfile, docker-compose, k8s manifests, CI workflow

Known limitations:
- TLS termination / MITM for content inspection not implemented (deferred to Phase 3/4)
- Quantized TinyML models are not bundled; mock inference used by default
- UI is minimal and intended for beta testing only

Upgrade notes:
- Install models in ./models/ to enable real inference
- Configure THREAT_EXCHANGE_API_KEY to enable cloud sync

Feedback:
- Please collect user feedback and file issues in the repository with `beta` label.
