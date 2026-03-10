const path = require('path');
const fs = require('fs');
const os = require('os');
const { installCA, uninstallCA } = require('../utils/mitmCaInstaller');

describe('mitmCaInstaller (sandbox mode)', () => {
  test('installCA rejects missing file', async () => {
    await expect(installCA('nonexistent-file.pem', { sandboxDir: path.join(os.tmpdir(), 'ss-sandbox') })).rejects.toThrow(/not found/);
  });

  test('installCA succeeds in sandbox and uninstall removes file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-ca-'));
    const certPath = path.join(tmp, 'test-ca.pem');
    await fs.promises.writeFile(certPath, 'dummy');

    const sandbox = path.join(tmp, 'sandbox');
    const res = await installCA(certPath, { sandboxDir: sandbox });
    expect(res).toHaveProperty('installed', true);
    expect(res.platform).toBe('sandbox');

    const removed = await uninstallCA(certPath, { sandboxDir: sandbox });
    expect(removed).toHaveProperty('removed', true);
  });
});
