const SovereignShield = require('../index');

jest.setTimeout(30000);

let appInstance;
let baseUrl;

beforeAll(async () => {
  process.env.PORT = '0';
  appInstance = new SovereignShield();

  // Wait until initialized (with timeout)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('SovereignShield init timeout')), 20000);
    (function waitReady() {
      if (appInstance.isInitialized) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(waitReady, 200);
      }
    })();
  });

  const port = appInstance.server.address().port;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  if (appInstance) {
    try {
      await appInstance.shutdown();
    } catch (e) {}
  }
});

test('Health endpoint responds', async () => {
  const res = await fetch(`${baseUrl}/health`);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toHaveProperty('status');
  expect(json.status).toBe('healthy');
});

test('Filter endpoint returns object', async () => {
  const payload = {
    userId: 'test-user',
    content: 'This message contains spam and phishing attempts',
    contentType: 'text',
    context: 'chat'
  };

  const res = await fetch(`${baseUrl}/api/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toHaveProperty('isFiltered');
  expect(json).toHaveProperty('processingTime');
});
