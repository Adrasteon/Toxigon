const https = require('https');
const selfsigned = require('selfsigned');
const axios = require('axios');
let HttpsProxyAgent = null;
try {
  HttpsProxyAgent = require('https-proxy-agent');
} catch (e) {
  HttpsProxyAgent = null;
}

describe('E2E MITM interception', () => {
  test('proxy can intercept and add header to HTTPS request', async () => {
    const Proxy = (() => {
      try { return require('http-mitm-proxy'); } catch (e) { return null; }
    })();

    if (!Proxy) {
      // Skip if optional dependency not present
      return expect(true).toBe(true);
    }

    // Skip if https-proxy-agent is not installed or does not expose a usable constructor
    if (!HttpsProxyAgent || !(typeof HttpsProxyAgent === 'function' || (HttpsProxyAgent && typeof HttpsProxyAgent.default === 'function'))) {
      return expect(true).toBe(true);
    }

    // Start MITM proxy
    const proxy = Proxy();
    proxy.onRequest((ctx, callback) => {
      try {
        ctx.proxyToServerRequestOptions.headers = ctx.proxyToServerRequestOptions.headers || {};
        ctx.proxyToServerRequestOptions.headers['x-mitm-test'] = '1';
      } catch (e) {}
      return callback();
    });

    // Start the proxy and attach robust error handling; add a safety timer to auto-close if it hangs
    let proxyCloseTimer;
    await new Promise((resolve, reject) => {
      try {
        proxy.listen({ port: 0 }, function() {
          resolve();
        });
      } catch (err) {
        return reject(err);
      }

      // attach to whichever error hook the library exposes
      if (typeof proxy.on === 'function') {
        proxy.on('error', reject);
      } else if (typeof proxy.onError === 'function') {
        proxy.onError((ctx, err) => reject(err));
      }

      // Safety timer: if the proxy doesn't close later, attempt best-effort close to avoid leaking handles
      proxyCloseTimer = setTimeout(() => {
        try {
          if (typeof proxy.close === 'function') {
            proxy.close(() => {});
          } else if (proxy.__server && typeof proxy.__server.close === 'function') {
            proxy.__server.close(() => {});
          }
        } catch (e) {}
      }, 15000);
      if (proxyCloseTimer && typeof proxyCloseTimer.unref === 'function') proxyCloseTimer.unref();
    });
    const proxyPort = proxy.__server && proxy.__server.address ? proxy.__server.address().port : 8080;

    // Generate self-signed cert for test HTTPS server (use sufficiently large RSA key)
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 1, keySize: 2048 });

    let receivedHeaders = null;
    const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const serverPort = server.address().port;
    if (server && typeof server.unref === 'function') server.unref();

    // Make HTTPS request through the MITM proxy
    // Create proxy agent in a way that works across different package exports
    let agent;
    if (typeof HttpsProxyAgent === 'function') {
      try {
        agent = new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);
      } catch (e) {
        agent = HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);
      }
    } else if (HttpsProxyAgent && typeof HttpsProxyAgent.default === 'function') {
      try {
        agent = new HttpsProxyAgent.default(`http://127.0.0.1:${proxyPort}`);
      } catch (e) {
        agent = HttpsProxyAgent.default(`http://127.0.0.1:${proxyPort}`);
      }
    } else {
      throw new Error('HttpsProxyAgent not available');
    }
    // Accept self-signed server cert for the test
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const url = `https://127.0.0.1:${serverPort}/`;
    const resp = await axios.get(url, { httpsAgent: agent, timeout: 5000, validateStatus: () => true });

    // Cleanup
    await new Promise((r) => server.close(r));
    if (proxyCloseTimer) clearTimeout(proxyCloseTimer);
    if (proxy && proxy.__server && typeof proxy.__server.unref === 'function') proxy.__server.unref();
    if (typeof proxy.close === 'function') {
      await new Promise((r) => proxy.close(r));
    } else if (proxy.__server && typeof proxy.__server.close === 'function') {
      await new Promise((r) => proxy.__server.close(r));
    }

    expect(resp.status).toBe(200);
    expect(receivedHeaders).toBeTruthy();
    // MITM added header should be present (case-insensitive)
    const headerKey = Object.keys(receivedHeaders).find(k => k.toLowerCase() === 'x-mitm-test');
    expect(headerKey).toBeDefined();
    expect(receivedHeaders[headerKey]).toBe('1');
  }, 20000);
});
