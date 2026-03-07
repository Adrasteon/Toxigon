const SovereignShield = require('../index');
const request = require('supertest');

let instance;

beforeEach(async () => {
  instance = new SovereignShield();
  // allow initialization to complete
  await new Promise((res) => setTimeout(res, 50));
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
