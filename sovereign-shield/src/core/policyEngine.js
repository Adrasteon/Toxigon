/**
 * Policy Engine
 * Manages user-defined content moderation policies with 1-10 sensitivity scale
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class PolicyEngine {
  constructor(dbPath = './data/policies.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      try {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        // ignore directory creation errors
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          this.createTables();
          resolve();
        }
      });
    });
  }

  createTables() {
    const createPoliciesTable = `
      CREATE TABLE IF NOT EXISTS policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        sensitivity_level INTEGER DEFAULT 5,
        parental_floor INTEGER DEFAULT 1,
        custom_keywords TEXT DEFAULT '[]',
        blocked_categories TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createThreatSignaturesTable = `
      CREATE TABLE IF NOT EXISTS threat_signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature_hash TEXT UNIQUE,
        threat_type TEXT,
        description TEXT,
        severity INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(createPoliciesTable);
    this.db.run(createThreatSignaturesTable);
  }

  /**
   * Set user policy configuration
   * @param {string} userId - User identifier
   * @param {number} sensitivityLevel - 1 (Lax) to 10 (Strict)
   * @param {number} parentalFloor - Minimum protection level set by parent
   * @param {Array} customKeywords - Custom keywords to filter
   * @param {Array} blockedCategories - Categories to block
   */
  async setPolicy(userId, sensitivityLevel, parentalFloor = 1, customKeywords = [], blockedCategories = []) {
    // Validate sensitivity level (1-10)
    const level = Math.max(1, Math.min(10, sensitivityLevel));
    const floor = Math.max(1, Math.min(10, parentalFloor));

    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO policies 
        (user_id, sensitivity_level, parental_floor, custom_keywords, blocked_categories, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run([
        userId,
        level,
        floor,
        JSON.stringify(customKeywords),
        JSON.stringify(blockedCategories)
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ userId, sensitivityLevel: level, parentalFloor: floor });
        }
      });

      stmt.finalize();
    });
  }

  /**
   * Get user policy configuration
   * @param {string} userId - User identifier
   */
  async getPolicy(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM policies WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (!row) {
            resolve(null);
          } else {
            resolve({
              userId: row.user_id,
              sensitivityLevel: row.sensitivity_level,
              parentalFloor: row.parental_floor,
              customKeywords: JSON.parse(row.custom_keywords || '[]'),
              blockedCategories: JSON.parse(row.blocked_categories || '[]'),
              createdAt: row.created_at,
              updatedAt: row.updated_at
            });
          }
        }
      );
    });
  }

  /**
   * Get effective sensitivity level (respects parental floor)
   * @param {string} userId - User identifier
   */
  async getEffectiveSensitivity(userId) {
    const policy = await this.getPolicy(userId);
    if (!policy) {
      return 5; // Default medium sensitivity
    }

    // Effective sensitivity cannot be lower than parental floor
    return Math.max(policy.sensitivityLevel, policy.parentalFloor);
  }

  /**
   * Add threat signature to local database
   * @param {string} signatureHash - Hash of the threat signature
   * @param {string} threatType - Type of threat
   * @param {string} description - Description of the threat
   * @param {number} severity - Severity level (1-10)
   */
  async addThreatSignature(signatureHash, threatType, description, severity) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO threat_signatures 
        (signature_hash, threat_type, description, severity)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run([signatureHash, threatType, description, severity], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, signatureHash, threatType, description, severity });
        }
      });

      stmt.finalize();
    });
  }

  /**
   * Check if content should be filtered based on policy
   * @param {string} userId - User identifier
   * @param {string} content - Content to check
   * @param {string} contentType - Type of content (text, image, etc.)
   */
  async shouldFilterContent(userId, content, contentType = 'text') {
    const policy = await this.getPolicy(userId);
    if (!policy) {
      return false; // Default allow if no policy set
    }

    const effectiveSensitivity = await this.getEffectiveSensitivity(userId);

    // Check custom keywords
    const customKeywords = policy.customKeywords;
    if (customKeywords.length > 0) {
      const contentLower = content.toLowerCase();
      for (const keyword of customKeywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }

    // Check threat signatures (simplified - in reality would hash and compare)
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const threatExists = await this.checkThreatSignature(contentHash);
    
    if (threatExists && effectiveSensitivity >= 3) {
      return true;
    }

    // Apply sensitivity-based filtering (simplified logic)
    // In a real implementation, this would use AI model confidence scores
    const contentLength = content.length;
    const suspiciousPatterns = this.detectSuspiciousPatterns(content);
    
    if (suspiciousPatterns.length > 0) {
      // Higher sensitivity = more likely to filter
      const threshold = 11 - effectiveSensitivity;
      return suspiciousPatterns.length >= threshold;
    }

    return false;
  }

  /**
   * Check if a threat signature exists in local database
   * @param {string} signatureHash - Hash to check
   */
  async checkThreatSignature(signatureHash) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM threat_signatures WHERE signature_hash = ?',
        [signatureHash],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  /**
   * Detect suspicious patterns in content (simplified implementation)
   * @param {string} content - Content to analyze
   */
  detectSuspiciousPatterns(content) {
    const suspiciousPatterns = [];
    const contentLower = content.toLowerCase();

    // Check for excessive capitalization
    if ((content.match(/[A-Z]/g) || []).length > content.length * 0.5) {
      suspiciousPatterns.push('excessive_caps');
    }

    // Check for excessive punctuation
    if ((content.match(/[!?.]{3,}/g) || []).length > 3) {
      suspiciousPatterns.push('excessive_punctuation');
    }

    // Check for suspicious keywords (simplified)
    const suspiciousKeywords = ['spam', 'scam', 'phishing', 'malware'];
    for (const keyword of suspiciousKeywords) {
      if (contentLower.includes(keyword)) {
        suspiciousPatterns.push(`suspicious_keyword_${keyword}`);
      }
    }

    return suspiciousPatterns;
  }

  /**
   * Get age-based policy template
   * @param {number} age - User age
   */
  getAgeBasedTemplate(age) {
    if (age < 13) {
      return {
        sensitivityLevel: 8,
        parentalFloor: 8,
        description: "Strict protection for children under 13"
      };
    } else if (age < 18) {
      return {
        sensitivityLevel: 6,
        parentalFloor: 6,
        description: "Moderate protection for teens"
      };
    } else {
      return {
        sensitivityLevel: 4,
        parentalFloor: 1,
        description: "Standard protection for adults"
      };
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = PolicyEngine;