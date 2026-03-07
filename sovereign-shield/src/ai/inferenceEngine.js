/**
 * AI Inference Engine
 * Handles ONNX model loading and inference for content classification
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Simple in-memory model cache keyed by model path + mtime + size
const modelCache = new Map();

class AIInferenceEngine {
  constructor(modelPath = './models/content_classifier.onnx') {
    this.modelPath = path.resolve(modelPath);
    this.session = null;
    this.isLoaded = false;
    this.modelMetadata = null;
    this.cacheKey = null;
  }

  /**
   * Initialize the ONNX runtime session with caching
   */
  async init() {
    try {
      // Import ONNX Runtime dynamically to handle optional dependency
      const onnxruntime = require('onnxruntime-node');

      // Check if model file exists
      let stat;
      try {
        stat = await fs.stat(this.modelPath);
        // Cache key based on path + mtime + size to auto-refresh when file changes
        this.cacheKey = `${this.modelPath}:${stat.mtimeMs}:${stat.size}`;
      } catch (err) {
        console.warn(`Model file not found at ${this.modelPath}, will attempt fallback models`);
      }

      const tryLoad = async (modelPathToTry) => {
        try {
          const modelStat = await fs.stat(modelPathToTry);
          const key = `${path.resolve(modelPathToTry)}:${modelStat.mtimeMs}:${modelStat.size}`;

          if (modelCache.has(key)) {
            const cached = modelCache.get(key);
            this.session = cached.session;
            this.modelMetadata = cached.metadata;
            this.isLoaded = true;
            this.cacheKey = key;
            console.log(`AI Inference Engine loaded model from cache: ${modelPathToTry}`);
            return true;
          }

          this.session = await onnxruntime.InferenceSession.create(modelPathToTry);
          this.isLoaded = true;
          this.modelMetadata = {
            inputNames: this.session.inputNames,
            outputNames: this.session.outputNames,
            modelPath: path.resolve(modelPathToTry)
          };

          modelCache.set(key, { session: this.session, metadata: this.modelMetadata });
          this.cacheKey = key;
          console.log(`AI Inference Engine initialized model: ${modelPathToTry}`);
          return true;
        } catch (err) {
          console.warn(`Failed to load model at ${modelPathToTry}: ${err.message}`);
          return false;
        }
      };

      // If primary model stat was found, try it first
      if (stat) {
        const primaryLoaded = await tryLoad(this.modelPath);
        if (primaryLoaded) return;
      }

      // Attempt fallback models in order
      const fallbackCandidates = [
        path.join('models', 'content_classifier_quant.onnx'),
        path.join('models', 'content_classifier_small.onnx')
      ];

      for (const candidate of fallbackCandidates) {
        const loaded = await tryLoad(candidate);
        if (loaded) {
          this.fallbackModelUsed = candidate;
          return;
        }
      }

      console.warn('No ONNX model could be loaded; using mock inference');
      this.isLoaded = false;
    } catch (error) {
      console.error('Failed to initialize AI Inference Engine (ONNX runtime unavailable or fatal error):', error);
      this.isLoaded = false;
    }
  }

  /**
   * Preprocess text content for model input
   * @param {string} text - Input text
   * @param {number} maxLength - Maximum sequence length
   */
  preprocessText(text, maxLength = 512) {
    // Simple preprocessing - in reality would use tokenizer
    const cleanedText = text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Simple tokenization (character-level for demo)
    const tokens = cleanedText.split(' ').slice(0, maxLength);
    
    // Convert to tensor-like format
    const inputArray = new Float32Array(maxLength).fill(0);
    tokens.forEach((token, index) => {
      // Simple hash-based tokenization
      inputArray[index] = this.hashToken(token) / 1000000;
    });

    return {
      input_ids: new onnxruntime.Tensor('float32', inputArray, [1, maxLength]),
      attention_mask: new onnxruntime.Tensor('float32', new Float32Array(maxLength).fill(1), [1, maxLength])
    };
  }

  /**
   * Simple token hashing for demo purposes
   * @param {string} token - Token to hash
   */
  hashToken(token) {
    return crypto.createHash('md5').update(token).digest('hex')
      .split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  }

  /**
   * Run inference on text content
   * @param {string} text - Content to classify
   * @param {string} contentType - Type of content (text, image)
   */
  async classifyContent(text, contentType = 'text') {
    if (!this.isLoaded) {
      return this.mockInference(text, contentType);
    }

    try {
      const inputs = this.preprocessText(text);
      
      // Run inference
      const outputs = await this.session.run(inputs);
      
      // Extract predictions
      const predictions = outputs[this.session.outputNames[0]];
      const scores = Array.from(predictions.data);
      
      // Convert to probabilities
      const probabilities = this.softmax(scores);
      
      return {
        isFiltered: probabilities[1] > 0.5, // Assuming index 1 is "inappropriate"
        confidence: Math.max(...probabilities),
        scores: probabilities,
        modelUsed: this.modelMetadata.modelPath,
        processingTime: Date.now()
      };
    } catch (error) {
      console.error('Inference error:', error);
      return this.mockInference(text, contentType);
    }
  }

  /**
   * Mock inference for when model is not available
   * @param {string} text - Content to classify
   * @param {string} contentType - Type of content
   */
  mockInference(text, contentType) {
    // Simple rule-based classification for demo
    const inappropriateKeywords = [
      'spam', 'scam', 'phishing', 'malware', 'virus', 'hate', 'violence',
      'nsfw', 'adult', 'explicit', 'dangerous', 'threat', 'attack'
    ];
    
    const textLower = text.toLowerCase();
    let score = 0.1; // Base score
    
    inappropriateKeywords.forEach(keyword => {
      if (textLower.includes(keyword)) {
        score += 0.3;
      }
    });

    // Add some randomness for demo
    score += Math.random() * 0.2;

    return {
      isFiltered: score > 0.5,
      confidence: score,
      scores: [1 - score, score],
      modelUsed: 'mock_classifier',
      processingTime: Date.now()
    };
  }

  /**
   * Softmax function for converting logits to probabilities
   * @param {Array} logits - Raw model outputs
   */
  softmax(logits) {
    const maxLogit = Math.max(...logits);
    const expSum = logits.reduce((sum, logit) => sum + Math.exp(logit - maxLogit), 0);
    return logits.map(logit => Math.exp(logit - maxLogit) / expSum);
  }

  /**
   * Preprocess image content for model input
   * @param {Buffer} imageBuffer - Image data
   */
  async preprocessImage(imageBuffer) {
    try {
      const sharp = require('sharp');
      
      // Resize and normalize image
      const processed = await sharp(imageBuffer)
        .resize(224, 224)
        .normalize()
        .raw()
        .toBuffer();

      // Convert to tensor format
      const inputArray = new Float32Array(processed.length);
      for (let i = 0; i < processed.length; i++) {
        inputArray[i] = processed[i] / 255.0;
      }

      return {
        input: new onnxruntime.Tensor('float32', inputArray, [1, 224, 224, 3])
      };
    } catch (error) {
      console.error('Image preprocessing error:', error);
      throw error;
    }
  }

  /**
   * Classify image content
   * @param {Buffer} imageBuffer - Image data
   */
  async classifyImage(imageBuffer) {
    if (!this.isLoaded) {
      return this.mockImageInference(imageBuffer);
    }

    try {
      const inputs = await this.preprocessImage(imageBuffer);
      const outputs = await this.session.run(inputs);
      
      const predictions = outputs[this.session.outputNames[0]];
      const scores = Array.from(predictions.data);
      const probabilities = this.softmax(scores);
      
      return {
        isFiltered: probabilities[1] > 0.5,
        confidence: Math.max(...probabilities),
        scores: probabilities,
        modelUsed: this.modelMetadata.modelPath,
        processingTime: Date.now()
      };
    } catch (error) {
      console.error('Image classification error:', error);
      return this.mockImageInference(imageBuffer);
    }
  }

  /**
   * Mock image inference
   * @param {Buffer} imageBuffer - Image data
   */
  mockImageInference(imageBuffer) {
    // Simple size-based classification for demo
    const imageSize = imageBuffer.length;
    const isLarge = imageSize > 1000000; // 1MB threshold
    
    return {
      isFiltered: isLarge,
      confidence: isLarge ? 0.8 : 0.2,
      scores: [0.2, 0.8],
      modelUsed: 'mock_image_classifier',
      processingTime: Date.now()
    };
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      isLoaded: this.isLoaded,
      metadata: this.modelMetadata,
      capabilities: ['text_classification', 'image_classification']
    };
  }

  /**
   * Close the inference session
   */
  async close() {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.isLoaded = false;
  }
}

module.exports = AIInferenceEngine;