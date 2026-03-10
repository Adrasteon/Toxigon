const express = require('express');
const bodyParser = require('body-parser');
const os = require('os');
const fs = require('fs');
const path = require('path');

const ThreatExchangeClient = require('../cloud/threatExchange.js');

describe('ThreatExchangeClient (integration with local HTTP fixture)', () => {
  let tmpDir;
  let server;
  let baseUrl;

  beforeEach((done) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-client-'));

    const app = express();
    app.use(bodyParser.json());

    // Auth endpoint
    app.post('/auth/token', (req, res) => {
      res.json({ token: 'tok-1', expiresAt: Date.now() + 60000 });
    });

    // Threat check
    app.get('/threats/check', (req, res) => {
      res.json({ threat: { id: 't1', score: 0.9 } });
    });

    // Threat updates
    app.get('/threats/updates', (req, res) => {
      res.json({ threats: [{ id: 't1', score: 0.9 }] });
    });

    app.post('/threats/report', (req, res) => {
      res.json({ success: true });
    });

    app.get('/health', (req, res) => res.json({ status: 'ok' }));

    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterEach(async () => {
    try { server && server.close(); } catch (e) { }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { }
  });

  test('initializes and fetches threat intelligence from local server', async () => {
    const client = new ThreatExchangeClient({ apiKey: 'key', userId: 'user', dataDir: tmpDir, baseUrl });
    await client.init();

    const content = 'suspicious content here';
    const res = await client.getThreatIntelligence(content);
    expect(res).toEqual({ id: 't1', score: 0.9 });

    // subsequent call hits cache
    const res2 = await client.getThreatIntelligence(content);
    expect(res2).toEqual({ id: 't1', score: 0.9 });

    await client.close();
  });

  test('makeRequest retry and circuit breaker opens after threshold (server down)', async () => {
    // close server to simulate network failures
    server.close();
    const client = new ThreatExchangeClient({ apiKey: null, userId: 'u', dataDir: tmpDir, baseUrl, maxRetries: 2, retryDelay: 10, failureThreshold: 2, circuitResetMs: 1000 });
    client.isInitialized = true;

    await expect(client.makeRequest('GET', '/test')).rejects.toThrow(/Request to Threat Exchange failed/);
    expect(client.circuitOpenUntil).toBeTruthy();
    await client.close();
  });

  test('reportThreat validates input and rejects invalid payloads', async () => {
    const client = new ThreatExchangeClient({ dataDir: tmpDir, baseUrl });
    await expect(client.reportThreat({ content: 'x' })).rejects.toThrow(/Invalid threat data/);
  });

  test('getThreatIntelligence throws for invalid content input', async () => {
    const client = new ThreatExchangeClient({ dataDir: tmpDir, baseUrl });
    await expect(client.getThreatIntelligence(null)).rejects.toThrow(/content must be a non-empty string/);
  });
});

