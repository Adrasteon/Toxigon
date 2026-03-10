/**
 * Sovereign Shield Main Application
 * Entry point for the Sovereign Safety Ecosystem software
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const client = require('prom-client');
// Avoid starting prom-client's global collectors during Jest tests to prevent leaked handles
if (!(process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test')) {
  client.collectDefaultMetrics({ prefix: 'ss_' });
}

// Import core components
const PolicyEngine = require('./core/policyEngine');
const ContentFilter = require('./filtering/contentFilter');
const ThreatExchangeClient = require('./cloud/threatExchange');
const SystemProxyManager = require('./utils/systemProxy');
const SecurityManager = require('./utils/securityManager');

class SovereignShield {
  constructor() {
    this.app = express();
    this.server = null;
    this.components = {};
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    try {
      console.log('🚀 Initializing Sovereign Shield...');
      
      // Initialize core components
      await this.initializeComponents();
      
      // Setup Express server
      this.setupServer();
      
      // Setup routes
      this.setupRoutes();
      
      this.isInitialized = true;
      console.log('✅ Sovereign Shield initialized successfully');
      
      // Start server
      this.startServer();
      
    } catch (error) {
      console.error('❌ Failed to initialize Sovereign Shield:', error);
      process.exit(1);
    }
  }

  async initializeComponents() {
    // Initialize Policy Engine
    this.components.policyEngine = new PolicyEngine();
    await this.components.policyEngine.init();
    console.log('📋 Policy Engine initialized');

    // Initialize Content Filter
    this.components.contentFilter = new ContentFilter();
    await this.components.contentFilter.init();
    console.log('🛡️ Content Filter initialized');

    // Initialize Threat Exchange Client
    this.components.threatExchange = new ThreatExchangeClient();
    await this.components.threatExchange.init();
    console.log('☁️ Threat Exchange Client initialized');

    // Initialize System Proxy Manager
    this.components.proxyManager = new SystemProxyManager();
    console.log('🌐 System Proxy Manager initialized');

    // Initialize Security Manager
    this.components.securityManager = new SecurityManager();
    console.log('🔒 Security Manager initialized');
  }

  setupServer() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // Compression
    this.app.use(compression());

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging and Prometheus metrics
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      if (!this._reqCounter) {
        try {
          this._reqCounter = new client.Counter({ name: 'ss_requests_total', help: 'Total inbound requests', labelNames: ['method','path','status'] });
        } catch (e) { /* ignore metric creation errors */ }
      }
      res.on('finish', () => {
        try {
          if (this._reqCounter) this._reqCounter.inc({ method: req.method, path: req.path, status: res.statusCode });
        } catch (e) {}
      });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        components: {
          policyEngine: 'active',
          contentFilter: 'active',
          threatExchange: 'active',
          proxyManager: 'ready',
          securityManager: 'active'
        }
      });
    });

    // Policy management routes
    this.app.get('/api/policy/:userId', async (req, res) => {
      try {
        const policy = await this.components.policyEngine.getPolicy(req.params.userId);
        res.json(policy || { message: 'No policy found' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/policy/:userId', async (req, res) => {
      try {
        const { sensitivityLevel, parentalFloor, customKeywords, blockedCategories } = req.body;
        const result = await this.components.policyEngine.setPolicy(
          req.params.userId,
          sensitivityLevel,
          parentalFloor,
          customKeywords,
          blockedCategories
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Content filtering routes
    this.app.post('/api/filter', async (req, res) => {
      try {
        const { userId, content, contentType, context } = req.body;
        const result = await this.components.contentFilter.filterContent(
          userId,
          content,
          contentType,
          context
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/filter/batch', async (req, res) => {
      try {
        const { userId, contentItems } = req.body;
        const results = await this.components.contentFilter.filterMultipleContent(
          userId,
          contentItems
        );
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Threat exchange routes
    this.app.get('/api/threats/statistics', async (req, res) => {
      try {
        const stats = await this.components.threatExchange.getThreatStatistics();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/threats/report', async (req, res) => {
      try {
        const result = await this.components.threatExchange.reportThreat(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // System management routes
    this.app.post('/api/proxy/start', async (req, res) => {
      try {
        const success = await this.components.proxyManager.startProxy();
        res.json({ success, status: this.components.proxyManager.getProxyStatus() });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/proxy/stop', async (req, res) => {
      try {
        const success = await this.components.proxyManager.stopProxy();
        res.json({ success, status: this.components.proxyManager.getProxyStatus() });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/proxy/status', (req, res) => {
      res.json(this.components.proxyManager.getProxyStatus());
    });

    // Security routes
    this.app.post('/api/security/audit', (req, res) => {
      const audit = this.components.securityManager.getSecurityAudit();
      res.json(audit);
    });

    // Static files for UI
    this.app.use('/ui', express.static(path.join(__dirname, '../ui')));
    
    // API documentation
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'Sovereign Shield API',
        version: '1.0.0',
        endpoints: {
          health: 'GET /health',
          policy: {
            get: 'GET /api/policy/:userId',
            set: 'POST /api/policy/:userId'
          },
          filter: {
            single: 'POST /api/filter',
            batch: 'POST /api/filter/batch'
          },
          threats: {
            statistics: 'GET /api/threats/statistics',
            report: 'POST /api/threats/report'
          },
          proxy: {
            start: 'POST /api/proxy/start',
            stop: 'POST /api/proxy/stop',
            status: 'GET /api/proxy/status'
          },
          security: {
            audit: 'POST /api/security/audit'
          }
        }
      });
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', client.register.contentType);
        res.send(await client.register.metrics());
      } catch (err) {
        res.status(500).send('Error collecting metrics');
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    });
  }

  startServer() {
    const port = process.env.PORT || 3000;
    
    this.server = this.app.listen(port, () => {
      console.log(`🌐 Sovereign Shield API running on port ${port}`);
      console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
      console.log(`❤️ Health Check: http://localhost:${port}/health`);
    });

    // Graceful shutdown handlers (store refs so they can be removed during tests)
    this._sigtermHandler = () => this.shutdown();
    this._sigintHandler = () => this.shutdown();
    process.on('SIGTERM', this._sigtermHandler);
    process.on('SIGINT', this._sigintHandler);
  }

  async shutdown() {
    console.log('\n🛑 Shutting down Sovereign Shield...');
    
    try {
      // Stop server
      if (this.server) {
        await new Promise((res) => this.server.close(() => res()));
        this.server = null;
      }

      // Cleanup components
      if (this.components.contentFilter) {
        await this.components.contentFilter.close();
      }

      if (this.components.threatExchange) {
        await this.components.threatExchange.close();
      }

      if (this.components.policyEngine) {
        await this.components.policyEngine.close();
      }

      console.log('✅ Sovereign Shield shutdown complete');
      // Clear Prometheus registry to stop background metric collectors
      try {
        if (client && client.register && typeof client.register.clear === 'function') {
          client.register.clear();
        }
      } catch (e) {
        // ignore
      }

      // Remove process signal handlers registered by this instance
      try {
        if (this._sigtermHandler) process.removeListener('SIGTERM', this._sigtermHandler);
        if (this._sigintHandler) process.removeListener('SIGINT', this._sigintHandler);
      } catch (e) {
        // ignore
      }

      // During tests we should not terminate the whole process
      if (!(process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test')) {
        process.exit(0);
      }
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      if (!(process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test')) {
        process.exit(1);
      }
      // rethrow so tests can observe the error
      throw error;
    }
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      isInitialized: this.isInitialized,
      components: {
        policyEngine: this.components.policyEngine ? 'active' : 'inactive',
        contentFilter: this.components.contentFilter ? 'active' : 'inactive',
        threatExchange: this.components.threatExchange ? 'active' : 'inactive',
        proxyManager: this.components.proxyManager ? 'ready' : 'inactive',
        securityManager: this.components.securityManager ? 'active' : 'inactive'
      },
      server: {
        running: !!this.server,
        port: process.env.PORT || 3000
      }
    };
  }
}

// Start the application
if (require.main === module) {
  new SovereignShield();
}

module.exports = SovereignShield;