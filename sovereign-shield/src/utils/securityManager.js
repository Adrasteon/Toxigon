/**
 * Security Manager
 * Handles encryption, secure storage, and security policies for Sovereign Shield
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const bcrypt = require('bcryptjs');

class SecurityManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltRounds = 12;
    
    // Security configuration
    this.config = {
      encryptionKey: process.env.SOVEREIGN_ENCRYPTION_KEY || this.generateEncryptionKey(),
      secureStoragePath: './data/secure/',
      maxFailedAttempts: 5,
      lockoutDuration: 300000, // 5 minutes
      sessionTimeout: 1800000 // 30 minutes
    };

    this.failedAttempts = new Map();
    this.activeSessions = new Map();
  }

  /**
   * Generate a secure encryption key
   */
  generateEncryptionKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param {string|Buffer} data - Data to encrypt
   * @param {string} key - Encryption key (optional, uses default if not provided)
   */
  encrypt(data, key = null) {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : Buffer.from(this.config.encryptionKey, 'hex');
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, encryptionKey);
      cipher.setAAD(Buffer.from('sovereign-shield', 'utf8'));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param {Object} encryptedData - Encrypted data object
   * @param {string} key - Encryption key (optional, uses default if not provided)
   */
  decrypt(encryptedData, key = null) {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : Buffer.from(this.config.encryptionKey, 'hex');
      const decipher = crypto.createDecipher(this.algorithm, encryptionKey);
      decipher.setAAD(Buffer.from('sovereign-shield', 'utf8'));
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash password using bcrypt
   * @param {string} password - Password to hash
   */
  async hashPassword(password) {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Securely store encrypted data
   * @param {string} filename - Filename to store data
   * @param {any} data - Data to store
   */
  async storeSecureData(filename, data) {
    try {
      // Ensure secure storage directory exists
      await fs.mkdir(this.config.secureStoragePath, { recursive: true });
      
      const dataString = JSON.stringify(data, null, 2);
      const encrypted = this.encrypt(dataString);
      
      const filepath = path.join(this.config.secureStoragePath, filename);
      await fs.writeFile(filepath, JSON.stringify(encrypted, null, 2));
      
      // Set file permissions to 600 (owner read/write only)
      await fs.chmod(filepath, 0o600);
      
      return { success: true, filepath };
    } catch (error) {
      throw new Error(`Failed to store secure data: ${error.message}`);
    }
  }

  /**
   * Retrieve and decrypt stored data
   * @param {string} filename - Filename to retrieve
   */
  async retrieveSecureData(filename) {
    try {
      const filepath = path.join(this.config.secureStoragePath, filename);
      
      // Check if file exists and is readable
      await fs.access(filepath, fs.constants.F_OK | fs.constants.R_OK);
      
      const encryptedData = await fs.readFile(filepath, 'utf8');
      const encryptedObject = JSON.parse(encryptedData);
      
      const decryptedData = this.decrypt(encryptedObject);
      return JSON.parse(decryptedData);
    } catch (error) {
      throw new Error(`Failed to retrieve secure data: ${error.message}`);
    }
  }

  /**
   * Generate secure session token
   * @param {string} userId - User identifier
   */
  generateSessionToken(userId) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.config.sessionTimeout;
    
    const session = {
      sessionId,
      userId,
      createdAt: Date.now(),
      expiresAt,
      lastActivity: Date.now()
    };
    
    this.activeSessions.set(sessionId, session);
    
    return {
      sessionId,
      expiresAt,
      token: this.signSessionToken(session)
    };
  }

  /**
   * Sign session token
   * @param {Object} session - Session object
   */
  signSessionToken(session) {
    const data = `${session.sessionId}:${session.userId}:${session.expiresAt}`;
    return crypto.createHmac('sha256', this.config.encryptionKey).update(data).digest('hex');
  }

  /**
   * Verify session token
   * @param {string} token - Session token to verify
   * @param {string} sessionId - Session ID
   */
  verifySessionToken(token, sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }
    
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      return { valid: false, reason: 'Session expired' };
    }
    
    const expectedToken = this.signSessionToken(session);
    
    if (token !== expectedToken) {
      return { valid: false, reason: 'Invalid token' };
    }
    
    // Update last activity
    session.lastActivity = Date.now();
    
    return { valid: true, session };
  }

  /**
   * Check for brute force attempts
   * @param {string} identifier - User identifier (IP, username, etc.)
   */
  checkBruteForce(identifier) {
    const now = Date.now();
    const attempts = this.failedAttempts.get(identifier);
    
    if (!attempts) {
      return { blocked: false, attempts: 0 };
    }
    
    // Clean up old attempts
    const recentAttempts = attempts.filter(time => now - time < this.config.lockoutDuration);
    
    if (recentAttempts.length === 0) {
      this.failedAttempts.delete(identifier);
      return { blocked: false, attempts: 0 };
    }
    
    this.failedAttempts.set(identifier, recentAttempts);
    
    if (recentAttempts.length >= this.config.maxFailedAttempts) {
      const timeLeft = this.config.lockoutDuration - (now - recentAttempts[0]);
      return { 
        blocked: true, 
        attempts: recentAttempts.length,
        timeLeft,
        reason: 'Too many failed attempts'
      };
    }
    
    return { blocked: false, attempts: recentAttempts.length };
  }

  /**
   * Record failed attempt
   * @param {string} identifier - User identifier
   */
  recordFailedAttempt(identifier) {
    const attempts = this.failedAttempts.get(identifier) || [];
    attempts.push(Date.now());
    this.failedAttempts.set(identifier, attempts);
  }

  /**
   * Clear failed attempts for identifier
   * @param {string} identifier - User identifier
   */
  clearFailedAttempts(identifier) {
    this.failedAttempts.delete(identifier);
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   */
  validatePasswordStrength(password) {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Check for common patterns
    const commonPatterns = [
      /123456/,
      /password/,
      /qwerty/,
      /abc123/,
      /letmein/,
      /welcome/
    ];
    
    for (const pattern of commonPatterns) {
      if (pattern.test(password.toLowerCase())) {
        errors.push('Password contains common patterns');
        break;
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate secure random string
   * @param {number} length - Length of string to generate
   * @param {string} charset - Character set to use
   */
  generateSecureRandom(length = 32, charset = 'alphanumeric') {
    let chars;
    
    switch (charset) {
      case 'alphanumeric':
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        break;
      case 'hex':
        chars = '0123456789abcdef';
        break;
      case 'base64':
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        break;
      default:
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    }
    
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(crypto.randomInt(0, chars.length));
    }
    
    return result;
  }

  /**
   * Securely delete file (overwrite before deletion)
   * @param {string} filepath - Path to file to delete
   */
  async secureDelete(filepath) {
    try {
      // Get file size
      const stats = await fs.stat(filepath);
      const fileSize = stats.size;
      
      // Overwrite with random data multiple times
      const passes = 3;
      
      for (let i = 0; i < passes; i++) {
        const randomData = crypto.randomBytes(fileSize);
        await fs.writeFile(filepath, randomData);
      }
      
      // Finally delete the file
      await fs.unlink(filepath);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Secure delete failed: ${error.message}`);
    }
  }

  /**
   * Get security audit log
   */
  getSecurityAudit() {
    return {
      timestamp: Date.now(),
      activeSessions: this.activeSessions.size,
      failedAttempts: Array.from(this.failedAttempts.entries()).map(([key, attempts]) => ({
        identifier: key,
        attempts: attempts.length,
        lastAttempt: attempts[attempts.length - 1]
      })),
      config: {
        maxFailedAttempts: this.config.maxFailedAttempts,
        lockoutDuration: this.config.lockoutDuration,
        sessionTimeout: this.config.sessionTimeout,
        algorithm: this.algorithm
      }
    };
  }

  /**
   * Cleanup expired sessions and old failed attempts
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up expired sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
      }
    }
    
    // Clean up old failed attempts
    for (const [identifier, attempts] of this.failedAttempts.entries()) {
      const recentAttempts = attempts.filter(time => now - time < this.config.lockoutDuration);
      
      if (recentAttempts.length === 0) {
        this.failedAttempts.delete(identifier);
      } else {
        this.failedAttempts.set(identifier, recentAttempts);
      }
    }
  }
}

module.exports = SecurityManager;