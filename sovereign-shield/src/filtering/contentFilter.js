/**
 * Content Filtering Engine
 * Handles real-time content filtering and substitution
 */

const PolicyEngine = require('../core/policyEngine');
const AIInferenceEngine = require('../ai/inferenceEngine');

class ContentFilter {
  constructor() {
    this.policyEngine = new PolicyEngine();
    this.aiEngine = new AIInferenceEngine();
    this.init();
  }

  async init() {
    await this.policyEngine.init();
    await this.aiEngine.init();
  }

  /**
   * Filter content based on user policy and AI classification
   * @param {string} userId - User identifier
   * @param {string} content - Content to filter
   * @param {string} contentType - Type of content (text, image, etc.)
   * @param {string} context - Context of content (chat, email, web, etc.)
   */
  async filterContent(userId, content, contentType = 'text', context = 'general') {
    const startTime = Date.now();
    
    try {
      // Get user policy
      const policy = await this.policyEngine.getPolicy(userId);
      if (!policy) {
        // No policy set, allow content
        return {
          originalContent: content,
          filteredContent: content,
          isFiltered: false,
          reason: 'no_policy_set',
          confidence: 0,
          processingTime: Date.now() - startTime,
          policyLevel: 5
        };
      }

      const effectiveSensitivity = await this.policyEngine.getEffectiveSensitivity(userId);
      
      // Check policy-based filtering first
      const policyFilterResult = await this.policyEngine.shouldFilterContent(userId, content, contentType);
      
      if (policyFilterResult) {
        return {
          originalContent: content,
          filteredContent: this.createFilterPlaceholder(content, 'Policy'),
          isFiltered: true,
          reason: 'policy_violation',
          confidence: 1.0,
          processingTime: Date.now() - startTime,
          policyLevel: effectiveSensitivity
        };
      }

      // AI-based filtering
      let aiResult;
      if (contentType === 'text') {
        aiResult = await this.aiEngine.classifyContent(content, 'text');
      } else if (contentType === 'image' && Buffer.isBuffer(content)) {
        aiResult = await this.aiEngine.classifyImage(content);
      } else {
        aiResult = { isFiltered: false, confidence: 0 };
      }

      // Apply sensitivity threshold
      const shouldFilter = this.applySensitivityThreshold(aiResult, effectiveSensitivity);
      
      if (shouldFilter) {
        return {
          originalContent: content,
          filteredContent: this.createFilterPlaceholder(content, 'AI'),
          isFiltered: true,
          reason: 'ai_classification',
          confidence: aiResult.confidence,
          processingTime: Date.now() - startTime,
          policyLevel: effectiveSensitivity,
          modelUsed: aiResult.modelUsed
        };
      }

      // Content passed all filters
      return {
        originalContent: content,
        filteredContent: content,
        isFiltered: false,
        reason: 'content_allowed',
        confidence: 1 - aiResult.confidence,
        processingTime: Date.now() - startTime,
        policyLevel: effectiveSensitivity
      };

    } catch (error) {
      console.error('Content filtering error:', error);
      return {
        originalContent: content,
        filteredContent: content,
        isFiltered: false,
        reason: 'filtering_error',
        confidence: 0,
        processingTime: Date.now() - startTime,
        policyLevel: 5,
        error: error.message
      };
    }
  }

  /**
   * Apply sensitivity threshold to AI classification result
   * @param {Object} aiResult - AI classification result
   * @param {number} sensitivityLevel - User sensitivity level (1-10)
   */
  applySensitivityThreshold(aiResult, sensitivityLevel) {
    if (!aiResult.isFiltered) {
      return false;
    }

    // Higher sensitivity = lower threshold for filtering
    // Sensitivity 1 (lax) -> threshold 0.9, Sensitivity 10 (strict) -> threshold 0.1
    const threshold = 1.0 - (sensitivityLevel * 0.09);
    
    return aiResult.confidence >= threshold;
  }

  /**
   * Create filter placeholder for blocked content
   * @param {string|Buffer} content - Original content
   * @param {string} filterType - Type of filter that blocked the content
   */
  createFilterPlaceholder(content, filterType) {
    if (typeof content === 'string') {
      // For text content, replace with placeholder
      const placeholder = `[Filtered - ${filterType} Protection]`;
      
      // Try to maintain some formatting
      if (content.length > 100) {
        return placeholder + ' ' + content.substring(content.length - 50);
      } else {
        return placeholder;
      }
    } else if (Buffer.isBuffer(content)) {
      // For image content, return a placeholder image or text
      return Buffer.from(`[Filtered Image - ${filterType} Protection]`);
    }
    
    return `[Filtered - ${filterType} Protection]`;
  }

  /**
   * Filter multiple pieces of content
   * @param {string} userId - User identifier
   * @param {Array} contentItems - Array of content items to filter
   */
  async filterMultipleContent(userId, contentItems) {
    const results = [];
    
    for (const item of contentItems) {
      const result = await this.filterContent(userId, item.content, item.type, item.context);
      results.push({
        ...result,
        contentId: item.id || results.length,
        originalType: item.type
      });
    }
    
    return results;
  }

  /**
   * Stream filtering for real-time content
   * @param {string} userId - User identifier
   * @param {ReadableStream} inputStream - Input stream
   * @param {WritableStream} outputStream - Output stream
   */
  async filterStream(userId, inputStream, outputStream) {
    const chunks = [];
    
    return new Promise((resolve, reject) => {
      inputStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      inputStream.on('end', async () => {
        try {
          const content = Buffer.concat(chunks);
          const result = await this.filterContent(userId, content, 'stream');
          
          if (result.isFiltered) {
            outputStream.write(Buffer.from(result.filteredContent));
          } else {
            outputStream.write(content);
          }
          
          outputStream.end();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      inputStream.on('error', reject);
      outputStream.on('error', reject);
    });
  }

  /**
   * Get filtering statistics for a user
   * @param {string} userId - User identifier
   */
  async getFilteringStats(userId) {
    // This would typically query a database for filtering history
    // For now, return basic stats
    return {
      userId,
      totalContentFiltered: 0,
      filterReasons: {
        policy_violation: 0,
        ai_classification: 0,
        threat_signature: 0
      },
      averageConfidence: 0,
      lastFiltered: null
    };
  }

  /**
   * Update user policy and re-filter cached content
   * @param {string} userId - User identifier
   * @param {Object} newPolicy - New policy configuration
   */
  async updatePolicyAndRefilter(userId, newPolicy) {
    // Update policy
    await this.policyEngine.setPolicy(
      userId, 
      newPolicy.sensitivityLevel, 
      newPolicy.parentalFloor,
      newPolicy.customKeywords,
      newPolicy.blockedCategories
    );

    // In a real implementation, this would re-filter cached content
    // For now, just return success
    return {
      userId,
      policyUpdated: true,
      refilteringRequired: false
    };
  }

  /**
   * Get content filtering report
   * @param {string} userId - User identifier
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   */
  async generateFilteringReport(userId, startDate, endDate) {
    // This would query filtering history from database
    // For now, return a basic report structure
    return {
      userId,
      reportPeriod: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalContentProcessed: 0,
        totalContentFiltered: 0,
        filterSuccessRate: '0%',
        averageProcessingTime: '0ms'
      },
      details: {
        byReason: {},
        byContentType: {},
        byTimeOfDay: {}
      }
    };
  }

  /**
   * Close the content filter and cleanup resources
   */
  async close() {
    await this.policyEngine.close();
    await this.aiEngine.close();
  }
}

module.exports = ContentFilter;