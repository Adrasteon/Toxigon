# User Acceptance Testing (UAT) Checklist

This checklist is for the Initial Beta Release of Sovereign Shield.

- [ ] Install application on Windows 10/11
- [ ] Verify installer places background service and creates auto-start entry (if enabled)
- [ ] Launch application and verify system tray icon appears
- [ ] Open UI and set policy for test user
- [ ] Verify /health returns healthy
- [ ] Verify content filtering works for text and image samples
- [ ] Verify threat reporting stores locally when offline and syncs when online
- [ ] Validate performance: <50ms average filter processing for single requests
- [ ] Run 1000 concurrent content requests without crashing (stress test)
- [ ] Verify logs export and security audit endpoint
- [ ] Confirm GDPR data deletion flow for user data
- [ ] Collect user feedback and record issues
