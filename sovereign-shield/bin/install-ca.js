#!/usr/bin/env node
const path = require('path');
const argv = require('yargs')
  .command('install [cert]', 'Install a CA certificate into the OS trust store', (yargs) => {
    yargs.positional('cert', { type: 'string', default: 'data/proxy-ca/ca.cert.pem' });
  })
  .command('uninstall [name]', 'Uninstall a CA by name or path', (yargs) => {
    yargs.positional('name', { type: 'string', default: 'Sovereign Shield Dev CA' });
  })
  .demandCommand(1)
  .help()
  .argv;

const cmd = argv._[0];
const mitm = require('../src/utils/mitmCaInstaller');

async function main() {
  try {
    if (cmd === 'install') {
      const cert = path.resolve(argv.cert || argv._[1]);
      const res = await mitm.installCA(cert);
      console.log('Install result:', res);
      process.exit(0);
    }

    if (cmd === 'uninstall') {
      const name = argv.name || argv._[1];
      const res = await mitm.uninstallCA(name);
      console.log('Uninstall result:', res);
      process.exit(0);
    }

    console.error('Unknown command:', cmd);
    process.exit(2);
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
