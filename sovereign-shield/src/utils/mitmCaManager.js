const fs = require('fs');
const path = require('path');

let selfsigned = null;
try {
  selfsigned = require('selfsigned');
} catch (e) {
  selfsigned = null;
}

async function generateOrLoadCA(caDir) {
  if (!selfsigned) {
    throw new Error('selfsigned not installed');
  }

  await fs.promises.mkdir(caDir, { recursive: true });

  const keyPath = path.join(caDir, 'ca.key.pem');
  const certPath = path.join(caDir, 'ca.cert.pem');

  try {
    await fs.promises.access(keyPath);
    await fs.promises.access(certPath);
    return { key: keyPath, cert: certPath };
  } catch (e) {
    // generate
  }

  const attrs = [{ name: 'commonName', value: 'Sovereign Shield Dev CA' }];
  const opts = { keySize: 2048, days: 3650, algorithm: 'sha256' };

  const pems = selfsigned.generate(attrs, opts);

  await fs.promises.writeFile(keyPath, pems.private, { mode: 0o600 });
  await fs.promises.writeFile(certPath, pems.cert, { mode: 0o644 });

  return { key: keyPath, cert: certPath };
}

module.exports = { generateOrLoadCA };
