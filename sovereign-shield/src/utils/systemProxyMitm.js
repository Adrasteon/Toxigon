/**
 * Lightweight TLS-terminating MITM proxy wrapper.
 * Uses `http-mitm-proxy` when available. Provides start/stop and status.
 */

const fs = require('fs');
const path = require('path');
let mitmCaManager = null;
try {
  mitmCaManager = require('./mitmCaManager');
} catch (e) {
  mitmCaManager = null;
}

let ProxyLib = null;
try {
  ProxyLib = require('http-mitm-proxy');
} catch (e) {
  // optional dependency - functionality will be disabled if not installed
  ProxyLib = null;
}

class SystemProxyMitm {
  constructor(opts = {}) {
    this.port = opts.port || 8080;
    this.caDir = opts.caDir || path.join(process.cwd(), 'data', 'proxy-ca');
    this.silent = !!opts.silent;
    this.proxy = null;
    this.serverInstance = null;
    this.running = false;
  }

  async ensureCADir() {
    try {
      await fs.promises.mkdir(this.caDir, { recursive: true });
    } catch (e) {
      // ignore
    }
  }

  async start() {
    if (!ProxyLib) {
      throw new Error('http-mitm-proxy not installed');
    }

    if (this.running) return;

    await this.ensureCADir();

    // Ensure a CA exists for the MITM proxy (dev flow). This is optional and
    // will be a best-effort operation if the helper is available.
    if (mitmCaManager) {
      try {
        const ca = await mitmCaManager.generateOrLoadCA(this.caDir);
        if (!this.silent) console.log(`MITM CA ready at ${ca.cert} ${ca.key}`);
      } catch (e) {
        if (!this.silent) console.warn('MITM CA generation failed:', e.message);
      }
    }

    this.proxy = ProxyLib();

    // configure CA storage location if library supports it
    try {
      this.proxy.sslCaDir = this.caDir; // some versions honor this
    } catch (e) {
      // ignore
    }

    this.proxy.onError((ctx, err) => {
      if (!this.silent) console.error('Proxy error:', err && err.message ? err.message : err);
    });

    this.proxy.onRequest((ctx, callback) => {
      if (!this.silent) {
        const host = ctx.clientToProxyRequest.headers.host || ctx.clientToProxyRequest.socket.remoteAddress;
        console.log(`MITM proxy request ${ctx.clientToProxyRequest.method} ${host}${ctx.clientToProxyRequest.url}`);
      }
      return callback();
    });

    return new Promise((resolve, reject) => {
      try {
        this.serverInstance = this.proxy.listen({ port: this.port }, () => {
          this.running = true;
          if (!this.silent) console.log(`MITM proxy listening on port ${this.port}`);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async stop() {
    if (!this.proxy || !this.running) return;

    return new Promise((resolve) => {
      try {
        this.serverInstance.close(() => {
          this.running = false;
          this.serverInstance = null;
          this.proxy = null;
          if (!this.silent) console.log('MITM proxy stopped');
          resolve();
        });
      } catch (e) {
        // best-effort
        this.running = false;
        this.serverInstance = null;
        this.proxy = null;
        resolve();
      }
    });
  }

  getStatus() {
    return { running: !!this.running, port: this.port, caDir: this.caDir };
  }
}

module.exports = SystemProxyMitm;
