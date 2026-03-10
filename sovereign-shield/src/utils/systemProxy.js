/**
 * System Proxy Manager
 * Manages system-level proxy configuration for content interception
 */

const { execSync, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
let SystemProxyMitm = null;
try {
  SystemProxyMitm = require('./systemProxyMitm');
} catch (e) {
  SystemProxyMitm = null;
}

class SystemProxyManager {
  constructor() {
    this.platform = os.platform();
    this.proxyPort = 8080;
    this.proxyHost = '127.0.0.1';
    this.isProxyActive = false;
    this.useMitm = (process.env.PROXY_MITM === '1' || process.env.PROXY_MITM === 'true');
    this.mitmProxy = null;
  }

  /**
   * Start system proxy for content interception
   */
  async startProxy() {
    if (this.isProxyActive) {
      console.log('Proxy is already active');
      return true;
    }

    try {
      // Set system proxy
      await this.setSystemProxy();
      
      // Start local proxy server
      await this.startLocalProxyServer();
      
      this.isProxyActive = true;
      console.log('System proxy started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start system proxy:', error);
      return false;
    }
  }

  /**
   * Stop system proxy
   */
  async stopProxy() {
    if (!this.isProxyActive) {
      console.log('Proxy is not active');
      return true;
    }

    try {
      // Stop local proxy server
      await this.stopLocalProxyServer();
      
      // Clear system proxy
      await this.clearSystemProxy();
      
      this.isProxyActive = false;
      console.log('System proxy stopped successfully');
      return true;
    } catch (error) {
      console.error('Failed to stop system proxy:', error);
      return false;
    }
  }

  /**
   * Set system proxy based on platform
   */
  async setSystemProxy() {
    switch (this.platform) {
      case 'win32':
        return this.setWindowsProxy();
      case 'darwin':
        return this.setMacOSProxy();
      case 'linux':
        return this.setLinuxProxy();
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Clear system proxy based on platform
   */
  async clearSystemProxy() {
    switch (this.platform) {
      case 'win32':
        return this.clearWindowsProxy();
      case 'darwin':
        return this.clearMacOSProxy();
      case 'linux':
        return this.clearLinuxProxy();
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Set Windows system proxy
   */
  async setWindowsProxy() {
    const proxyUrl = `http://${this.proxyHost}:${this.proxyPort}`;
    
    try {
      // Set HTTP proxy
      execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${proxyUrl}" /f`);
      
      // Enable proxy
      execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`);
      
      // Set bypass list (local addresses)
      execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "<local>" /f`);
      
      console.log('Windows proxy configured');
    } catch (error) {
      throw new Error(`Windows proxy setup failed: ${error.message}`);
    }
  }

  /**
   * Clear Windows system proxy
   */
  async clearWindowsProxy() {
    try {
      // Disable proxy
      execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`);
      
      // Clear proxy server
      execSync(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /f`);
      
      console.log('Windows proxy cleared');
    } catch (error) {
      throw new Error(`Windows proxy cleanup failed: ${error.message}`);
    }
  }

  /**
   * Set macOS system proxy
   */
  async setMacOSProxy() {
    const proxyUrl = `${this.proxyHost}:${this.proxyPort}`;
    
    try {
      // Get network service
      const networkService = await this.getMacOSNetworkService();
      
      if (!networkService) {
        throw new Error('Could not determine network service');
      }

      // Set HTTP proxy
      execSync(`networksetup -setwebproxy "${networkService}" ${this.proxyHost} ${this.proxyPort}`);
      execSync(`networksetup -setwebproxystate "${networkService}" on`);
      
      // Set HTTPS proxy
      execSync(`networksetup -setsecurewebproxy "${networkService}" ${this.proxyHost} ${this.proxyPort}`);
      execSync(`networksetup -setsecurewebproxystate "${networkService}" on`);
      
      // Set bypass list
      execSync(`networksetup -setproxybypassdomains "${networkService}" "localhost,127.0.0.1,<local>"`);
      
      console.log('macOS proxy configured');
    } catch (error) {
      throw new Error(`macOS proxy setup failed: ${error.message}`);
    }
  }

  /**
   * Clear macOS system proxy
   */
  async clearMacOSProxy() {
    try {
      const networkService = await this.getMacOSNetworkService();
      
      if (networkService) {
        // Disable HTTP proxy
        execSync(`networksetup -setwebproxystate "${networkService}" off`);
        
        // Disable HTTPS proxy
        execSync(`networksetup -setsecurewebproxystate "${networkService}" off`);
      }
      
      console.log('macOS proxy cleared');
    } catch (error) {
      throw new Error(`macOS proxy cleanup failed: ${error.message}`);
    }
  }

  /**
   * Set Linux system proxy (GNOME/KDE)
   */
  async setLinuxProxy() {
    const proxyUrl = `http://${this.proxyHost}:${this.proxyPort}`;
    
    try {
      // Set GNOME proxy (most common)
      execSync(`gsettings set org.gnome.system.proxy mode 'manual'`);
      execSync(`gsettings set org.gnome.system.proxy.http host '${this.proxyHost}'`);
      execSync(`gsettings set org.gnome.system.proxy.http port ${this.proxyPort}`);
      execSync(`gsettings set org.gnome.system.proxy.https host '${this.proxyHost}'`);
      execSync(`gsettings set org.gnome.system.proxy.https port ${this.proxyPort}`);
      execSync(`gsettings set org.gnome.system.proxy ignore-hosts "['localhost', '127.0.0.1', '<local>']"`);
      
      console.log('Linux proxy configured');
    } catch (error) {
      // Try alternative methods for different desktop environments
      try {
        // KDE Plasma
        execSync(`kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key ProxyType 1`);
        execSync(`kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key httpProxy '${proxyUrl}'`);
        execSync(`kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key httpsProxy '${proxyUrl}'`);
      } catch (kdeError) {
        // Fallback to environment variables
        process.env.HTTP_PROXY = proxyUrl;
        process.env.HTTPS_PROXY = proxyUrl;
        process.env.NO_PROXY = 'localhost,127.0.0.1';
      }
      
      console.log('Linux proxy configured (fallback method)');
    }
  }

  /**
   * Clear Linux system proxy
   */
  async clearLinuxProxy() {
    try {
      // Clear GNOME proxy
      execSync(`gsettings set org.gnome.system.proxy mode 'none'`);
      
      console.log('Linux proxy cleared');
    } catch (error) {
      try {
        // Clear KDE proxy
        execSync(`kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key ProxyType 0`);
      } catch (kdeError) {
        // Clear environment variables
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
        delete process.env.NO_PROXY;
      }
      
      console.log('Linux proxy cleared (fallback method)');
    }
  }

  /**
   * Get macOS network service name
   */
  async getMacOSNetworkService() {
    return new Promise((resolve, reject) => {
      exec('networksetup -listallnetworkservices', (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const services = stdout.split('\n').filter(line => !line.startsWith('*') && line.trim());
        
        // Try to find active service
        for (const service of services) {
          exec(`networksetup -getwebproxy "${service}"`, (err, output) => {
            if (!err && output.includes('Enabled: Yes')) {
              resolve(service);
              return;
            }
          });
        }

        // Fallback to first service
        resolve(services[0] || 'Wi-Fi');
      });
    });
  }

  /**
   * Start local proxy server for content filtering
   */
  async startLocalProxyServer() {
    // If MITM requested and available, use it
    if (this.useMitm && SystemProxyMitm) {
      if (this.mitmProxy && this.mitmProxy.getStatus().running) {
        console.log('MITM proxy already running');
        return true;
      }

      this.mitmProxy = new SystemProxyMitm({ port: this.proxyPort, silent: false });
      await this.mitmProxy.start();
      console.log(`MITM proxy started on port ${this.proxyPort}`);
      return true;
    }

    const http = require('http');
    const https = require('https');

    if (this.localProxyServer) {
      console.log('Local proxy server already running');
      return true;
    }

    this.localProxyServer = http.createServer((clientReq, clientRes) => {
      // Basic HTTP proxy handling (does not implement full CONNECT tunneling)
      if (clientReq.method === 'CONNECT') {
        clientRes.writeHead(501);
        clientRes.end('CONNECT method not implemented in lightweight proxy');
        return;
      }

      try {
        const parsed = new URL(clientReq.url);
        const isSecure = parsed.protocol === 'https:';
        const targetModule = isSecure ? https : http;

        const options = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isSecure ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: clientReq.method,
          headers: clientReq.headers
        };

        const proxyReq = targetModule.request(options, (proxyRes) => {
          clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(clientRes);
        });

        proxyReq.on('error', (err) => {
          console.error('Proxy request error:', err.message);
          clientRes.writeHead(502);
          clientRes.end('Bad Gateway');
        });

        clientReq.pipe(proxyReq);
      } catch (err) {
        console.error('Proxy handling error:', err);
        clientRes.writeHead(500);
        clientRes.end('Proxy error');
      }
    });

    this.localProxyServer.on('clientError', (err, socket) => {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    await new Promise((resolve, reject) => {
      this.localProxyServer.listen(this.proxyPort, this.proxyHost, (err) => {
        if (err) return reject(err);
        console.log(`Local proxy server listening on ${this.proxyHost}:${this.proxyPort}`);
        resolve();
      });
    });

    return true;
  }

  /**
   * Stop local proxy server
   */
  async stopLocalProxyServer() {
    // Stop MITM if running
    if (this.mitmProxy) {
      try {
        await this.mitmProxy.stop();
      } catch (e) {
        // ignore
      }
      this.mitmProxy = null;
      console.log('MITM proxy stopped');
      return true;
    }

    if (this.localProxyServer) {
      await new Promise((resolve) => this.localProxyServer.close(() => resolve()));
      this.localProxyServer = null;
      console.log('Local proxy server stopped');
      return true;
    }

    console.log('No local proxy server to stop');
    return true;
  }

  /**
   * Get proxy status
   */
  getProxyStatus() {
    return {
      isActive: this.isProxyActive,
      platform: this.platform,
      proxyHost: this.proxyHost,
      proxyPort: this.proxyPort,
      proxyUrl: `http://${this.proxyHost}:${this.proxyPort}`
    };
  }

  /**
   * Test proxy connectivity
   */
  async testProxy() {
    if (!this.isProxyActive) {
      return { success: false, message: 'Proxy is not active' };
    }

    try {
      // Test proxy by making a request through it
      const axios = require('axios');
      
      const response = await axios.get('http://httpbin.org/ip', {
        proxy: {
          host: this.proxyHost,
          port: this.proxyPort
        },
        timeout: 5000
      });

      return {
        success: true,
        message: 'Proxy is working correctly',
        response: response.data
      };
    } catch (error) {
      return {
        success: false,
        message: `Proxy test failed: ${error.message}`
      };
    }
  }

  /**
   * Get proxy configuration for different applications
   */
  getProxyConfig() {
    const proxyUrl = `http://${this.proxyHost}:${this.proxyPort}`;
    
    return {
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      no_proxy: 'localhost,127.0.0.1,<local>',
      environment: {
        HTTP_PROXY: proxyUrl,
        HTTPS_PROXY: proxyUrl,
        NO_PROXY: 'localhost,127.0.0.1,<local>'
      }
    };
  }
}

module.exports = SystemProxyManager;