const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(`Command failed: ${cmd}\n${stderr || err.message}`);
        e.code = err.code;
        e.stdout = stdout;
        e.stderr = stderr;
        return reject(e);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function installCA(certPath) {
  if (!certPath) throw new Error('certPath required');
  const abs = path.resolve(certPath);
  if (!fs.existsSync(abs)) throw new Error(`CA file not found: ${abs}`);

  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: use certutil to add to Trusted Root Certification Authorities
    const cmd = `certutil -addstore -f "Root" "${abs}"`;
    return run(cmd).then(() => ({ platform: 'win32', installed: true }));
  }

  if (platform === 'darwin') {
    // macOS: add to System keychain (requires sudo)
    const cmd = `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${abs}"`;
    return run(cmd).then(() => ({ platform: 'darwin', installed: true }));
  }

  // Linux: try common locations
  if (platform === 'linux') {
    // Debian/Ubuntu style
    const target = '/usr/local/share/ca-certificates/sovereign-shield-ca.crt';
    const copyCmd = `sudo cp "${abs}" "${target}"`;
    const updateCmd = 'sudo update-ca-certificates';
    return run(copyCmd)
      .then(() => run(updateCmd))
      .then(() => ({ platform: 'linux', installed: true, target }))
      .catch(async (err) => {
        // Fallback: RHEL/CentOS
        const altTarget = '/etc/pki/ca-trust/source/anchors/sovereign-shield-ca.crt';
        try {
          await run(`sudo cp "${abs}" "${altTarget}"`);
          await run('sudo update-ca-trust extract');
          return { platform: 'linux', installed: true, target: altTarget };
        } catch (err2) {
          throw new Error('Failed to install CA on Linux: ' + (err2.stderr || err2.message));
        }
      });
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

async function uninstallCA(certPathOrName) {
  const platform = os.platform();
  if (platform === 'win32') {
    // Try by subject name
    const cmd = `certutil -delstore "Root" "${certPathOrName}"`;
    return run(cmd).then(() => ({ platform: 'win32', removed: true }));
  }

  if (platform === 'darwin') {
    // macOS: remove by cert filename (best-effort, requires sudo)
    const cmd = `sudo security delete-certificate -c "${certPathOrName}" /Library/Keychains/System.keychain`;
    return run(cmd).then(() => ({ platform: 'darwin', removed: true }));
  }

  if (platform === 'linux') {
    // Attempt to remove the Debian-style file then update
    const target = '/usr/local/share/ca-certificates/sovereign-shield-ca.crt';
    try {
      await run(`sudo rm -f "${target}"`);
      await run('sudo update-ca-certificates --fresh');
      return { platform: 'linux', removed: true, target };
    } catch (err) {
      const alt = '/etc/pki/ca-trust/source/anchors/sovereign-shield-ca.crt';
      await run(`sudo rm -f "${alt}"`);
      await run('sudo update-ca-trust extract');
      return { platform: 'linux', removed: true, target: alt };
    }
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

module.exports = { installCA, uninstallCA };
