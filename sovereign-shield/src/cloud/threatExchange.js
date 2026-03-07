/**
 * Cloud Threat Exchange Client
 * Handles communication with the Cloud Threat Exchange (CTE) for threat intelligence
 */

const axios = require('axios');
const crypto = require('crypto');

class ThreatExchangeClient {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://api.threatexchange.sovereignshield.io',
      apiKey: config.apiKey || process.env.THREAT_EXCHANGE_API_KEY,
      userId: config.userId || process.env.USER_ID,
      updateInterval: config.updateInterval || 300000, // 5 minutes
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000
    };
    
    this.isInitialized = false;
    this.lastUpdate = null;
    this.updateTimer = null;
    this.threatCache = new Map();
  }

  /**
   * Initialize the threat exchange client
   */
  async init() {
    if (!this.config.apiKey) {
      console.warn('No API key provided for Threat Exchange. Operating in read-only mode.');
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
      throw new Error(`Authentication failed: ${error.message}`);
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
      throw new Error('Threat Exchange client not initialized');
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
      this.threatCache.set(threatHash, {
        ...threat,
        cachedAt: Date.now(),
        source: 'cloud'
      });

      // Also store in local database if policy engine is available
      try {
        // This would integrate with the PolicyEngine's threat signature storage
        // For now, we'll just cache it
      } catch (error) {
        console.warn('Failed to store threat in local database:', error);
      }
    }
  }

  /**
   * Report a new threat to the cloud
   * @param {Object} threatData - Threat information to report
   */
  async reportThreat(threatData) {
    if (!this.isInitialized) {
      throw new Error('Threat Exchange client not initialized');
    }

    const reportData = {
      ...threatData,
      reportedBy: this.config.userId,
      reportedAt: Date.now(),
      anonymized: true,
      hash: this.hashThreat(threatData)
    };

    try {
      const response = await this.makeRequest('POST', '/threats/report', reportData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to report threat: ${error.message}`);
    }
  }

  /**
   * Get threat intelligence for specific content
   * @param {string} content - Content to check for threats
   * @param {string} contentType - Type of content
   */
  async getThreatIntelligence(content, contentType = 'text') {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Check local cache first
    if (this.threatCache.has(contentHash)) {
      return this.threatCache.get(contentHash);
    }

    // Query cloud if available
    try {
      const response = await this.makeRequest('GET', '/threats/check', {
        hash: contentHash,
        type: contentType
      });

      if (response.data && response.data.threat) {
        this.threatCache.set(contentHash, response.data.threat);
        return response.data.threat;
      }
    } catch (error) {
      console.warn('Failed to get threat intelligence from cloud:', error);
    }

    return null;
  }

  /**
   * Get threat statistics and trends
   */
  async getThreatStatistics() {
    try {
      const response = await this.makeRequest('GET', '/threats/statistics');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get threat statistics: ${error.message}`);
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
    let retries = 0;
    
    while (retries < this.config.maxRetries) {
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
        return response;
      } catch (error) {
        retries++;
        
        if (retries >= this.config.maxRetries) {
          throw error;
        }

        // Wait before retrying
        await this.delay(this.config.retryDelay * retries);
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
  }
}

module.exports = ThreatExchangeClient;