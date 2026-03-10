jest.mock('child_process', () => ({
  exec: (cmd, opts, cb) => {
    // simulate success
    if (typeof opts === 'function') cb = opts;
    cb && cb(null, 'ok', '');
  }
}));

const path = require('path');
const { installCA, uninstallCA } = require('../utils/mitmCaInstaller');

describe('mitmCaInstaller', () => {
  test('installCA rejects missing file', async () => {
    await expect(installCA('nonexistent-file.pem')).rejects.toThrow(/not found/);
  });

  test('installCA succeeds when file exists (mocked cmd)', async () => {
    const tmp = path.join(__dirname, '..', '..', 'data', 'proxy-ca');
    await require('fs').promises.mkdir(tmp, { recursive: true });
    const certPath = path.join(tmp, 'test-ca.pem');
    await require('fs').promises.writeFile(certPath, 'dummy');

    await expect(installCA(certPath)).resolves.toHaveProperty('installed', true);
    await expect(uninstallCA(certPath)).resolves.toHaveProperty('removed', true);
  });
});
