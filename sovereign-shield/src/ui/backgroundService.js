/*
 Background service for Sovereign Shield
 Runs as a detached Node process and manages the System Proxy lifecycle
*/

const path = require('path');
const fs = require('fs');
const SystemProxyManager = require('../utils/systemProxy');

const dataDir = path.join(process.cwd(), 'data');
const pidFile = path.join(dataDir, 'background.pid');
const logFile = path.join(dataDir, 'background.log');

function log(...args) {
  const line = `[${new Date().toISOString()}] ` + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try { fs.appendFileSync(logFile, line + '\n'); } catch (e) { /* ignore */ }
  console.log(line);
}

(async () => {
  try {
    // Ensure data dir exists
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}

    // Write pid
    fs.writeFileSync(pidFile, String(process.pid));
    log('Background service started, pid=' + process.pid);

    const proxyManager = new SystemProxyManager();

    // Start proxy and keep running
    try {
      await proxyManager.startProxy();
      log('System proxy started by background service');
    } catch (err) {
      log('Failed to start system proxy:', err.message || err);
    }

    // Periodic health check
    const interval = setInterval(async () => {
      try {
        const status = proxyManager.getProxyStatus();
        log('Proxy status', status);
      } catch (err) {
        log('Background health check error:', err.message || err);
      }
    }, 60 * 1000);

    // Graceful shutdown
    const shutdown = async () => {
      clearInterval(interval);
      try {
        await proxyManager.stopProxy();
        log('System proxy stopped by background service');
      } catch (err) {
        log('Error stopping proxy during shutdown:', err.message || err);
      }

      try { fs.unlinkSync(pidFile); } catch (e) {}
      log('Background service exiting');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
  } catch (err) {
    log('Unhandled background service error:', err.message || err);
    process.exit(1);
  }
})();
