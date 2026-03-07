const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

class AutoStart {
  constructor(appName = 'SovereignShield') {
    this.appName = appName;
    this.platform = os.platform();
  }

  enable() {
    switch (this.platform) {
      case 'win32':
        return this.enableWindows();
      case 'darwin':
        return this.enableMac();
      case 'linux':
        return this.enableLinux();
      default:
        throw new Error('Unsupported platform for autostart');
    }
  }

  disable() {
    switch (this.platform) {
      case 'win32':
        return this.disableWindows();
      case 'darwin':
        return this.disableMac();
      case 'linux':
        return this.disableLinux();
      default:
        throw new Error('Unsupported platform for autostart');
    }
  }

  enableWindows() {
    const exePath = process.execPath;
    const command = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${this.appName}" /t REG_SZ /d "\"${exePath}\" \"${path.join(process.cwd(), 'src', 'ui', 'backgroundService.js')}\"" /f`;
    execSync(command);
    return true;
  }

  disableWindows() {
    const command = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${this.appName}" /f`;
    try { execSync(command); } catch (e) { /* ignore */ }
    return true;
  }

  enableMac() {
    // Use launch agents
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>${this.appName}</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>${process.execPath}</string>\n    <string>${path.join(process.cwd(), 'src', 'ui', 'backgroundService.js')}</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n</dict>\n</plist>`;
    const launchPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Library', 'LaunchAgents', `${this.appName}.plist`);
    execSync(`mkdir -p "${path.dirname(launchPath)}"`);
    execSync(`bash -lc 'cat > "${launchPath}" <<"PLIST"\n${plist}\nPLIST'`);
    return true;
  }

  disableMac() {
    const launchPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Library', 'LaunchAgents', `${this.appName}.plist`);
    try { execSync(`rm -f "${launchPath}"`); } catch (e) {}
    return true;
  }

  enableLinux() {
    // Use .desktop in autostart
    const autostartDir = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.config'), 'autostart');
    const desktopFile = path.join(autostartDir, `${this.appName}.desktop`);
    const execPath = process.execPath;
    const content = `[Desktop Entry]\nType=Application\nExec=\"${execPath}\" \"${path.join(process.cwd(), 'src', 'ui', 'backgroundService.js')}\"\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\nName=${this.appName}\nComment=Start Sovereign Shield background service`;
    execSync(`mkdir -p "${autostartDir}"`);
    execSync(`bash -lc 'cat > "${desktopFile}" <<"DESK"\n${content}\nDESK'`);
    return true;
  }

  disableLinux() {
    const autostartDir = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.config'), 'autostart');
    const desktopFile = path.join(autostartDir, `${this.appName}.desktop`);
    try { execSync(`rm -f "${desktopFile}"`); } catch (e) {}
    return true;
  }
}

module.exports = AutoStart;