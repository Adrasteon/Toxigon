const SovereignShield = require('../index');
const request = require('supertest');

let instance;

beforeEach(async () => {
  // Use ephemeral port to avoid EADDRINUSE in CI/dev machines
  process.env.PORT = '0';
  instance = new SovereignShield();

  // Wait until the app reports it is initialized or timeout
  const start = Date.now();
  while (!instance.isInitialized && Date.now() - start < 5000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, 50));
  }

  if (!instance.isInitialized) {
    throw new Error('SovereignShield did not initialize in time');
  }
});

afterEach(async () => {
  try {
    if (instance && instance.shutdown) await instance.shutdown();
  } catch (e) {}
});

test('Metrics endpoint responds with Prometheus metrics', async () => {
  const res = await request(instance.app).get('/metrics');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/plain|application\/openmetrics-text/);
  expect(res.text).toMatch(/ss_/);
});
