jest.mock('axios');

const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');

const ThreatExchangeClient = require('../cloud/threatExchange.js');

describe('ThreatExchangeClient', () => {
  let tmpDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-client-'));
  });

  afterEach(async () => {
    // remove temp dir recursively
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { }
  });

  test('initializes and fetches threat intelligence from cloud', async () => {
    // mock auth token
    axios.post.mockImplementationOnce((url, body, cfg) => {
      if (url.endsWith('/auth/token')) return Promise.resolve({ data: { token: 'tok-1', expiresAt: Date.now() + 60000 } });
      return Promise.reject(new Error('unexpected post'));
    });

    const sampleThreat = { id: 't1', score: 0.9 };
    // mock GET /threats/check
    axios.mockImplementation(async (config) => {
      if (config.url && config.url.endsWith('/threats/check')) {
        return { data: { threat: sampleThreat } };
      }
      // default fallback
      return { data: {} };
    });

    const client = new ThreatExchangeClient({ apiKey: 'key', userId: 'user', dataDir: tmpDir });
    await client.init();

    const content = 'suspicious content here';
    const res = await client.getThreatIntelligence(content);
    expect(res).toEqual(sampleThreat);
    // second call should hit in-memory cache (axios should not be called for check again)
    axios.mockClear();
    const res2 = await client.getThreatIntelligence(content);
    expect(res2).toEqual(sampleThreat);

    await client.close();
  });

  test('makeRequest retry and circuit breaker opens after threshold', async () => {
    // make axios throw for every request
    axios.mockImplementation(() => Promise.reject(new Error('network')));

    const client = new ThreatExchangeClient({ apiKey: null, userId: 'u', dataDir: tmpDir, maxRetries: 2, retryDelay: 10, failureThreshold: 2, circuitResetMs: 1000 });
    // force initialized so makeRequest will attempt cloud calls
    client.isInitialized = true;
    // call makeRequest and expect final error
    await expect(client.makeRequest('GET', '/test')).rejects.toThrow(/Request to Threat Exchange failed/);
    // After failures >= threshold, circuitOpenUntil should be set
    expect(client.circuitOpenUntil).toBeTruthy();

    // subsequent immediate call should fail fast with circuit message
    await expect(client.makeRequest('GET', '/test')).rejects.toThrow(/circuit open/);

    await client.close();
  });

  test('reportThreat validates input and rejects invalid payloads', async () => {
    const client = new ThreatExchangeClient({ dataDir: tmpDir });
    // invalid: no type
    await expect(client.reportThreat({ content: 'x' })).rejects.toThrow(/Invalid threat data/);
  });

  test('getThreatIntelligence throws for invalid content input', async () => {
    const client = new ThreatExchangeClient({ dataDir: tmpDir });
    await expect(client.getThreatIntelligence(null)).rejects.toThrow(/content must be a non-empty string/);
  });
});

