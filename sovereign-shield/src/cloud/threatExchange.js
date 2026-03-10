/**
 * Cloud Threat Exchange Client
 * Handles communication with the Cloud Threat Exchange (CTE) for threat intelligence
 */

const axios = require('axios');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

class ThreatExchangeClient {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://api.threatexchange.sovereignshield.io',
      apiKey: config.apiKey || process.env.THREAT_EXCHANGE_API_KEY,
      userId: config.userId || process.env.USER_ID,
      updateInterval: config.updateInterval || 300000, // 5 minutes
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      // Circuit breaker settings
      failureThreshold: config.failureThreshold || 5,
      circuitResetMs: config.circuitResetMs || 60000
    };
    
    this.isInitialized = false;
    this.lastUpdate = null;
    this.updateTimer = null;
    this.threatCache = new Map();
    this.failureCount = 0;
    this.circuitOpenUntil = null;

    // Local persistence for offline/fast lookup
    this.dataDir = config.dataDir || path.join(process.cwd(), 'data');
    this.dbPath = path.join(this.dataDir, 'threats.db');
    this.db = null;
  }

  /**
   * Initialize the threat exchange client
   */
  async init() {
    // Ensure data directory exists and initialize DB for caching
    await this.initDb();

    if (!this.config.apiKey) {
      console.warn('No API key provided for Threat Exchange. Operating in read-only mode.');
      // Still allow local DB usage
      this.isInitialized = false;
      this.startPeriodicUpdates();
      return;
    }

    try {
      await this.authenticate();
      this.isInitialized = true;
      this.startPeriodicUpdates();
      console.log('Threat Exchange client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Threat Exchange client:', error);
      this.isInitialized = false;
      this.startPeriodicUpdates();
    }
  }

  /**
   * Authenticate with the Threat Exchange API
   */
  async authenticate() {
    if (!this.config.apiKey) {
      throw new Error('API key required for authentication');
    }

    try {
      const response = await axios.post(`${this.config.baseUrl}/auth/token`, {
        userId: this.config.userId,
        timestamp: Date.now()
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      this.authToken = response.data.token;
      this.authExpiry = response.data.expiresAt;
    } catch (error) {
      throw new Error(`Authentication failed: ${error && error.message ? error.message : String(error)}`);
    }
  }

  /**
   * Start periodic updates from the cloud
   */
  startPeriodicUpdates() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(async () => {
      try {
        await this.fetchThreatUpdates();
      } catch (error) {
        console.error('Periodic threat update failed:', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Fetch threat updates from the cloud
   */
  async fetchThreatUpdates() {
    if (!this.isInitialized) {
      // Not initialized - skip cloud fetchs
      console.warn('Skipping fetchThreatUpdates: client not initialized');
      return null;
    }

    try {
      const response = await this.makeRequest('GET', '/threats/updates', {
        since: this.lastUpdate || 0,
        limit: 100
      });

      if (response.data && response.data.threats) {
        await this.processThreatUpdates(response.data.threats);
        this.lastUpdate = Date.now();
      }

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch threat updates: ${error.message}`);
    }
  }

  /**
   * Process threat updates and store in local cache
   * @param {Array} threats - Array of threat updates
   */
  async processThreatUpdates(threats) {
    for (const threat of threats) {
      const threatHash = this.hashThreat(threat);
      
      // Store in cache
      const cached = {
        ...threat,
        cachedAt: Date.now(),
        source: 'cloud'
      };

      this.threatCache.set(threatHash, cached);

      // Persist to local DB for offline querying
      try {
        await this.saveThreatToDb(threatHash, cached);
      } catch (error) {
        console.warn('Failed to store threat in local database:', error.message);
      }
    }
  }

  /**
   * Report a new threat to the cloud
   * @param {Object} threatData - Threat information to report
   */
  async reportThreat(threatData) {
    // Validate incoming threat data
    try {
      this.validateThreatData(threatData);
    } catch (err) {
      throw new Error(`Invalid threat data: ${err.message}`);
    }
    const reportData = {
      ...threatData,
      reportedBy: this.config.userId,
      reportedAt: Date.now(),
      anonymized: true,
      hash: this.hashThreat(threatData)
    };

    // Attempt cloud report if initialized, otherwise store locally for later sync
    if (this.isInitialized) {
      try {
        const response = await this.makeRequest('POST', '/threats/report', reportData);
        // Also cache locally
        try { await this.saveThreatToDb(reportData.hash, { ...reportData, source: 'reported_cloud' }); } catch (e) { /* ignore */ }
        return response.data;
      } catch (error) {
        console.warn('Cloud report failed, storing locally for later sync:', error && error.message ? error.message : error);
        await this.saveThreatToDb(reportData.hash, { ...reportData, source: 'reported_local', cachedAt: Date.now() });
        return { success: false, message: 'Stored locally due to cloud failure' };
      }
    }

    // Not initialized - store locally
    await this.saveThreatToDb(reportData.hash, { ...reportData, source: 'reported_offline', cachedAt: Date.now() });
    return { success: true, message: 'Reported locally (offline mode)' };
  }

  /**
   * Get threat intelligence for specific content
   * @param {string} content - Content to check for threats
   * @param {string} contentType - Type of content
   */
  async getThreatIntelligence(content, contentType = 'text') {
    if (!content || typeof content !== 'string') throw new Error('content must be a non-empty string');
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Check in-memory cache first
    if (this.threatCache.has(contentHash)) {
      return this.threatCache.get(contentHash);
    }

    // Check local DB cache
    try {
      const row = await this.getThreatFromDb(contentHash);
      if (row) {
        const parsed = JSON.parse(row.data);
        this.threatCache.set(contentHash, parsed);
        return parsed;
      }
    } catch (err) {
      // ignore db errors and proceed to cloud
    }

    // Query cloud if available
    if (this.isInitialized) {
      try {
        const response = await this.makeRequest('GET', '/threats/check', {
          hash: contentHash,
          type: contentType
        });

        if (response.data && response.data.threat) {
          this.threatCache.set(contentHash, response.data.threat);
          // persist locally
          try { await this.saveThreatToDb(contentHash, { ...response.data.threat, source: 'cloud' }); } catch (e) { }
          return response.data.threat;
        }
      } catch (error) {
        console.warn('Failed to get threat intelligence from cloud:', error.message);
      }
    }

    return null;
  }

  /**
   * Get threat statistics and trends
   */
  async getThreatStatistics() {
    // Try cloud first
    try {
      if (this.isInitialized) {
        const response = await this.makeRequest('GET', '/threats/statistics');
        return response.data;
      }
    } catch (error) {
      console.warn('Cloud statistics unavailable, falling back to local DB:', error.message);
    }

    // Fallback: compute basic stats from local DB
    try {
      const rows = await this.dbAll('SELECT source, COUNT(*) as cnt FROM threats GROUP BY source');
      const stats = {};
      for (const r of rows) stats[r.source] = r.cnt;
      return { fromLocalDB: true, bySource: stats };
    } catch (err) {
      throw new Error(`Failed to get threat statistics: ${err.message}`);
    }
  }

  /**
   * Get threat categories and their descriptions
   */
  async getThreatCategories() {
    try {
      const response = await this.makeRequest('GET', '/threats/categories');
      return response.data.categories || [];
    } catch (error) {
      throw new Error(`Failed to get threat categories: ${error.message}`);
    }
  }

  /**
   * Hash threat data for consistent identification
   * @param {Object} threatData - Threat data to hash
   */
  hashThreat(threatData) {
    const dataString = JSON.stringify(threatData, Object.keys(threatData).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Make authenticated request to Threat Exchange API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   */
  async makeRequest(method, endpoint, data = null) {
    // Circuit breaker: refuse requests while circuit is open
    if (this.circuitOpenUntil && Date.now() < this.circuitOpenUntil) {
      throw new Error('Threat Exchange circuit open due to repeated failures');
    }

    let retries = 0;
    const maxRetries = Math.max(1, this.config.maxRetries);

    while (retries < maxRetries) {
      try {
        const config = {
          method,
          url: `${this.config.baseUrl}${endpoint}`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`,
            'X-Client-Version': '1.0.0',
            'X-User-ID': this.config.userId
          },
          timeout: 30000
        };

        if (data) {
          if (method === 'GET') {
            config.params = data;
          } else {
            config.data = data;
          }
        }

        const response = await axios(config);

        // Successful request -> reset failure counter
        this.failureCount = 0;
        return response;
      } catch (error) {
        retries++;

        // If unauthorized, attempt one re-auth and retry
        if (error && error.response && error.response.status === 401 && retries < maxRetries) {
          try {
            await this.authenticate();
            // small pause to ensure token propagated
            await this.delay(200);
            continue;
          } catch (authErr) {
            // auth failed - fall through to retry/backoff
          }
        }

        // Increment failure count and possibly open circuit
        this.failureCount++;
        if (this.failureCount >= this.config.failureThreshold) {
          this.circuitOpenUntil = Date.now() + this.config.circuitResetMs;
          console.warn('Threat Exchange circuit opened due to repeated failures');
        }

        if (retries >= maxRetries) {
          const msg = (error && error.message) ? error.message : String(error);
          throw new Error(`Request to Threat Exchange failed after ${retries} retries: ${msg}`);
        }

        // Exponential backoff with full jitter
        const backoffBase = this.config.retryDelay || 1000;
        const backoff = Math.floor(Math.random() * (backoffBase * Math.pow(2, retries)));
        await this.delay(backoff);
      }
    }
  }

  /**
   * Utility function to create delay
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize local sqlite DB and helper wrappers
   */
  async initDb() {
    try {
      await fsp.mkdir(this.dataDir, { recursive: true });
      this.db = new sqlite3.Database(this.dbPath);

      // Promisify simple helpers
      this.dbRun = (sql, params=[]) => new Promise((res, rej) => this.db.run(sql, params, function(err){ if(err) return rej(err); res(this); }));
      this.dbGet = (sql, params=[]) => new Promise((res, rej) => this.db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
      this.dbAll = (sql, params=[]) => new Promise((res, rej) => this.db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

      await this.dbRun(`CREATE TABLE IF NOT EXISTS threats (
        hash TEXT PRIMARY KEY,
        data TEXT,
        cachedAt INTEGER,
        source TEXT
      )`);

      console.log('Threat DB initialized at', this.dbPath);
    } catch (error) {
      console.warn('Failed to initialize local threat DB:', error.message);
    }
  }

  async saveThreatToDb(hash, dataObj) {
    if (!this.db) return;
    const now = Date.now();
    const payload = JSON.stringify(dataObj);
    try {
      await this.dbRun('INSERT OR REPLACE INTO threats (hash, data, cachedAt, source) VALUES (?,?,?,?)', [hash, payload, now, dataObj.source || 'local']);
    } catch (err) {
      console.warn('DB save error:', err.message);
    }
  }

  /**
   * Validate threat data shape and required fields
   */
  validateThreatData(threatData) {
    if (!threatData || typeof threatData !== 'object') throw new Error('threatData must be an object');
    if (!threatData.type || typeof threatData.type !== 'string') throw new Error('threatData.type is required');
    if (!threatData.content && !threatData.hash) throw new Error('threatData must include content or hash');
    if (threatData.content && typeof threatData.content !== 'string') throw new Error('threatData.content must be a string');
    return true;
  }

  async getThreatFromDb(hash) {
    if (!this.db) return null;
    try {
      const row = await this.dbGet('SELECT * FROM threats WHERE hash = ?', [hash]);
      return row;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Get local threat cache status
   */
  getCacheStatus() {
    return {
      isInitialized: this.isInitialized,
      cacheSize: this.threatCache.size,
      lastUpdate: this.lastUpdate,
      nextUpdate: this.lastUpdate ? this.lastUpdate + this.config.updateInterval : null
    };
  }

  /**
   * Clear local threat cache
   */
  clearCache() {
    this.threatCache.clear();
    this.lastUpdate = null;
  }

  /**
   * Get threat exchange health status
   */
  async getHealthStatus() {
    try {
      const response = await axios.get(`${this.config.baseUrl}/health`, {
        timeout: 5000
      });
      
      return {
        status: 'healthy',
        apiStatus: response.data.status,
        lastCheck: Date.now(),
        endpoint: this.config.baseUrl
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastCheck: Date.now(),
        endpoint: this.config.baseUrl
      };
    }
  }

  /**
   * Close the threat exchange client and cleanup resources
   */
  async close() {
    this.stopPeriodicUpdates();
    this.clearCache();
    this.isInitialized = false;
    this.authToken = null;

    if (this.db) {
      try {
        await new Promise((res, rej) => this.db.close(err => err ? rej(err) : res()));
        console.log('Threat DB closed');
      } catch (err) {
        console.warn('Failed to close threat DB:', err.message);
      }
      this.db = null;
    }
  }
}

module.exports = ThreatExchangeClient;