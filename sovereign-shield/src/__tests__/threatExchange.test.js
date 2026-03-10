jest.mock('axios');
const axios = require('axios');
const path = require('path');
const ThreatExchangeClient = require('../cloud/threatExchange');

describe('ThreatExchangeClient integration (mocked HTTP)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('init without apiKey remains uninitialized', async () => {
    const client = new ThreatExchangeClient({ apiKey: null, dataDir: path.join(process.cwd(), 'data', 'test-threats') });
    await client.init();
    expect(client.isInitialized).toBe(false);
    await client.close();
  });

  test('authenticate and fetchThreatUpdates uses HTTP when apiKey provided', async () => {
    // Mock auth token response
    axios.post.mockResolvedValueOnce({ data: { token: 'test-token', expiresAt: Date.now() + 60000 } });
    // Mock generic axios call for fetchThreatUpdates
    axios.mockResolvedValueOnce({ data: { threats: [{ id: 't1', score: 0.9 }] } });

    const client = new ThreatExchangeClient({ apiKey: 'fake-key', baseUrl: 'https://api.test', dataDir: path.join(process.cwd(), 'data', 'test-threats-2') });
    await client.init();

    expect(client.isInitialized).toBe(true);

    const res = await client.fetchThreatUpdates();
    expect(res).toHaveProperty('threats');
    expect(Array.isArray(res.threats)).toBe(true);
    expect(res.threats[0].id).toBe('t1');

    await client.close();
  });
});
