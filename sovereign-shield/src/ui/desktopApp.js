/**
 * Desktop Application
 * Cross-platform desktop application for Sovereign Shield
 * Supports Windows, macOS, and Linux
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const PolicyEngine = require('../core/policyEngine');
const ContentFilter = require('../filtering/contentFilter');
const ThreatExchangeClient = require('../cloud/threatExchange');

class DesktopApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.policyEngine = new PolicyEngine();
    this.contentFilter = new ContentFilter();
    this.threatExchange = new ThreatExchangeClient();
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    // Initialize core components
    await this.policyEngine.init();
    await this.contentFilter.init();
    await this.threatExchange.init();
    
    this.isInitialized = true;
    
    // Create application
    app.whenReady().then(() => {
      // Spawn background service as detached process for continuous protection
      try {
        const { spawn } = require('child_process');
        const bgPath = require('path').join(__dirname, 'backgroundService.js');
        const child = spawn(process.execPath, [bgPath], { detached: true, stdio: 'ignore' });
        child.unref();
        console.log('Background service spawned (detached)');
      } catch (err) {
        console.warn('Failed to spawn background service:', err.message || err);
      }

      this.createWindow();
      this.createTray();
      this.setupIPC();

      // Setup autostart to ensure background service runs after login (Windows/macOS/Linux)
      try {
        const AutoStart = require('../utils/autostart');
        this.autostart = new AutoStart('SovereignShield');
        // Do not enable automatically; leave control to the user via settings UI
        // this.autostart.enable();
        console.log('AutoStart helper initialized');
      } catch (e) {
        console.warn('AutoStart helper not available:', e.message);
      }
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      icon: path.join(__dirname, '../assets/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    // Load the React app or static HTML
    const indexPath = path.join(__dirname, '../ui/index.html');
    this.mainWindow.loadFile(indexPath);
    
    // Open dev tools in development
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools();
    }
  }

  createTray() {
    const trayIcon = path.join(__dirname, '../assets/tray-icon.png');
    this.tray = new Tray(trayIcon);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Sovereign Shield',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        }
      },
      {
        label: 'Settings',
        click: () => this.openSettings()
      },
      {
        label: 'Status',
        submenu: [
          {
            label: 'Protected',
            type: 'radio',
            id: 'status-protected',
            checked: true
          },
          {
            label: 'Paused',
            type: 'radio',
            id: 'status-paused',
            checked: false
          }
        ]
      },
      {
        type: 'separator'
      },
      {
        label: 'Exit',
        click: () => app.quit()
      }
    ]);

    this.tray.setToolTip('Sovereign Shield - Privacy-First Content Protection');
    this.tray.setContextMenu(contextMenu);
    
    this.tray.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.isVisible() ? this.mainWindow.hide() : this.mainWindow.show();
      }
    });

    // Periodically update tray status based on proxy status
    this.trayStatusInterval = setInterval(async () => {
      try {
        const status = this.components?.proxyManager?.getProxyStatus ? this.components.proxyManager.getProxyStatus() : { isActive: this.isProxyActive };
        await this.updateTrayStatus(status.isActive ? 'protected' : 'paused');
      } catch (e) {
        // ignore
      }
    }, 5000);
  }

  setupIPC() {
    // Policy management
    ipcMain.handle('get-policy', async (event, userId) => {
      return await this.policyEngine.getPolicy(userId);
    });

    ipcMain.handle('set-policy', async (event, userId, policy) => {
      return await this.policyEngine.setPolicy(
        userId, 
        policy.sensitivityLevel, 
        policy.parentalFloor,
        policy.customKeywords,
        policy.blockedCategories
      );
    });

    ipcMain.handle('get-effective-sensitivity', async (event, userId) => {
      return await this.policyEngine.getEffectiveSensitivity(userId);
    });

    // Content filtering
    ipcMain.handle('filter-content', async (event, userId, content, contentType, context) => {
      return await this.contentFilter.filterContent(userId, content, contentType, context);
    });

    ipcMain.handle('filter-multiple-content', async (event, userId, contentItems) => {
      return await this.contentFilter.filterMultipleContent(userId, contentItems);
    });

    // Threat exchange
    ipcMain.handle('get-threat-intelligence', async (event, content, contentType) => {
      return await this.threatExchange.getThreatIntelligence(content, contentType);
    });

    ipcMain.handle('report-threat', async (event, threatData) => {
      return await this.threatExchange.reportThreat(threatData);
    });

    ipcMain.handle('get-threat-statistics', async (event) => {
      return await this.threatExchange.getThreatStatistics();
    });

    // System information
    ipcMain.handle('get-system-status', async (event) => {
      return {
        isInitialized: this.isInitialized,
        policyEngine: await this.getPolicyEngineStatus(),
        contentFilter: await this.getContentFilterStatus(),
        threatExchange: this.threatExchange.getCacheStatus()
      };
    });

    ipcMain.handle('export-logs', async (event, options) => {
      return await this.exportLogs(options);
    });

    // Autostart controls
    ipcMain.handle('autostart-enable', async () => {
      try {
        if (!this.autostart) {
          const AutoStart = require('../utils/autostart');
          this.autostart = new AutoStart('SovereignShield');
        }
        this.autostart.enable();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('autostart-disable', async () => {
      try {
        if (this.autostart) this.autostart.disable();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Background service controls
    ipcMain.handle('background-start', async () => {
      try {
        const { spawn } = require('child_process');
        const bgPath = path.join(__dirname, 'backgroundService.js');
        const child = spawn(process.execPath, [bgPath], { detached: true, stdio: 'ignore' });
        child.unref();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('background-stop', async () => {
      try {
        const pidFile = path.join(process.cwd(), 'data', 'background.pid');
        const pid = fsSync.readFileSync(pidFile, 'utf8');
        process.kill(Number(pid));
        try { fsSync.unlinkSync(pidFile); } catch (e) {}
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  }

  async getPolicyEngineStatus() {
    try {
      const policy = await this.policyEngine.getPolicy('default');
      return {
        status: 'active',
        hasPolicy: !!policy,
        sensitivityLevel: policy?.sensitivityLevel || 5,
        customKeywords: policy?.customKeywords?.length || 0,
        blockedCategories: policy?.blockedCategories?.length || 0
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async getContentFilterStatus() {
    try {
      const modelInfo = this.contentFilter.aiEngine.getModelInfo();
      return {
        status: modelInfo.isLoaded ? 'active' : 'mock_mode',
        modelLoaded: modelInfo.isLoaded,
        capabilities: modelInfo.capabilities,
        lastFilterTime: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async exportLogs(options = {}) {
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `sovereign-shield-logs-${timestamp}.json`;
      const filepath = path.join(logsDir, filename);
      
      const logs = {
        exportTime: new Date().toISOString(),
        systemStatus: await this.getSystemStatus(),
        policyData: await this.exportPolicyData(),
        threatCache: Array.from(this.threatExchange.threatCache.entries())
      };
      
      await fs.writeFile(filepath, JSON.stringify(logs, null, 2));
      
      return {
        success: true,
        filepath,
        filename
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async exportPolicyData() {
    // This would export policy data (excluding sensitive information)
    return {
      exportTime: new Date().toISOString(),
      note: 'Policy data exported for backup and analysis'
    };
  }

  openSettings() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('navigate-to-settings');
    }
  }

  async showNotification(title, body, actions = []) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('show-notification', {
        title,
        body,
        actions
      });
    }
  }

  async updateTrayStatus(status) {
    if (this.tray) {
      const iconPath = status === 'protected' 
        ? path.join(__dirname, '../assets/tray-icon-protected.png')
        : path.join(__dirname, '../assets/tray-icon-paused.png');
      
      try { this.tray.setImage(iconPath); } catch (e) { /* some platforms may not support setImage */ }
      this.tray.setToolTip(`Sovereign Shield - ${status.toUpperCase()}`);

      // Update context menu status radios
      try {
        const menu = this.tray.getContextMenu();
        if (menu) {
          const items = menu.items;
          if (status === 'protected') {
            items.forEach(it => { if (it.id === 'status-protected') it.checked = true; if (it.id === 'status-paused') it.checked = false; });
          } else {
            items.forEach(it => { if (it.id === 'status-protected') it.checked = false; if (it.id === 'status-paused') it.checked = true; });
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  async cleanup() {
    await this.policyEngine.close();
    await this.contentFilter.close();
    await this.threatExchange.close();
  }
}

// Handle single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus the main window
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.focus();
    }
  });

  // Create the application instance
  const desktopApp = new DesktopApp();

  // Handle cleanup on quit
  app.on('before-quit', async () => {
    await desktopApp.cleanup();
  });
}

module.exports = DesktopApp;