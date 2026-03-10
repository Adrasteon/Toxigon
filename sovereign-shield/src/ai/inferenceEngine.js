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
  constructor(modelPath = './models/content_classifier.onnx', imageModelPath = './models/image_classifier.onnx') {
    this.modelPath = path.resolve(modelPath);
    this.imageModelPath = path.resolve(imageModelPath);
    this.session = null;
    this.imageSession = null;
    this.ort = null; // ONNX runtime handle when available
    this.isLoaded = false;
    this.modelMetadata = null;
    this.imageModelMetadata = null;
    this.cacheKey = null;
    this.imageCacheKey = null;
  }

  /**
   * Initialize the ONNX runtime session with caching
   */
  async init() {
    try {
      // Import ONNX Runtime dynamically to handle optional dependency
      const onnxruntime = require('onnxruntime-node');
      this.ort = onnxruntime;

      // TEXT model: Check if model file exists
      try {
        const stat = await fs.stat(this.modelPath);
        this.cacheKey = `${this.modelPath}:${stat.mtimeMs}:${stat.size}`;
      } catch (err) {
        console.warn(`Text model file not found at ${this.modelPath}, text inference will use mock mode`);
      }

      // IMAGE model: Check if image model exists
      try {
        const imgStat = await fs.stat(this.imageModelPath);
        this.imageCacheKey = `${this.imageModelPath}:${imgStat.mtimeMs}:${imgStat.size}`;
      } catch (err) {
        // Not fatal; image inference can still use mock
        // console.warn(`Image model file not found at ${this.imageModelPath}, image inference will use mock mode`);
      }

      // Load cached TEXT session if available
      if (this.cacheKey && modelCache.has(this.cacheKey)) {
        const cached = modelCache.get(this.cacheKey);
        this.session = cached.session;
        this.modelMetadata = cached.metadata;
        this.isLoaded = true;
        console.log('AI Inference Engine loaded text model from cache');
      } else if (this.cacheKey) {
        try {
          this.session = await this.ort.InferenceSession.create(this.modelPath);
          this.isLoaded = true;
          this.modelMetadata = {
            inputNames: this.session.inputNames,
            outputNames: this.session.outputNames,
            modelPath: this.modelPath
          };
          modelCache.set(this.cacheKey, { session: this.session, metadata: this.modelMetadata });
          console.log('AI Inference Engine initialized text model successfully');
        } catch (e) {
          console.warn('Failed to create text session, continuing in mock mode:', e.message);
          this.session = null;
          this.isLoaded = false;
        }
      }

      // Load cached IMAGE session if available
      if (this.imageCacheKey && modelCache.has(this.imageCacheKey)) {
        const cachedImg = modelCache.get(this.imageCacheKey);
        this.imageSession = cachedImg.session;
        this.imageModelMetadata = cachedImg.metadata;
        console.log('AI Inference Engine loaded image model from cache');
      } else if (this.imageCacheKey) {
        try {
          this.imageSession = await this.ort.InferenceSession.create(this.imageModelPath);
          this.imageModelMetadata = {
            inputNames: this.imageSession.inputNames,
            outputNames: this.imageSession.outputNames,
            modelPath: this.imageModelPath
          };
          modelCache.set(this.imageCacheKey, { session: this.imageSession, metadata: this.imageModelMetadata });
          console.log('AI Inference Engine initialized image model successfully');
        } catch (e) {
          // Leave imageSession null to allow mock image inference
          console.warn('Failed to create image session, image inference will use mock mode:', e.message);
          this.imageSession = null;
        }
      }
    } catch (error) {
      console.error('Failed to initialize AI Inference Engine (ONNX not available or error):', error);
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
    // We'll produce integer token ids (hashed) and attention/token_type arrays
    const hashIds = new BigInt64Array(maxLength);
    for (let i = 0; i < maxLength; i++) hashIds[i] = 0n;
    tokens.forEach((token, index) => {
      // Simple hash-based tokenization -> deterministic integer ids
      const h = Math.abs(this.hashToken(token)) % 1000000; // keep values small
      hashIds[index] = BigInt(h);
    });

    const attention = new BigInt64Array(maxLength);
    for (let i = 0; i < maxLength; i++) attention[i] = 1n;
    const tokenTypes = new BigInt64Array(maxLength);
    for (let i = 0; i < maxLength; i++) tokenTypes[i] = 0n;

    if (!this.ort) {
      // Return raw arrays if ONNX runtime not available (caller should check isLoaded)
      return {
        input_ids: hashIds,
        attention_mask: attention,
        token_type_ids: tokenTypes
      };
    }

    return {
      input_ids: new this.ort.Tensor('int64', hashIds, [1, maxLength]),
      attention_mask: new this.ort.Tensor('int64', attention, [1, maxLength]),
      token_type_ids: new this.ort.Tensor('int64', tokenTypes, [1, maxLength])
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

      // Use runtime's Tensor constructor when available
      if (this.ort) {
        return {
          input: new this.ort.Tensor('float32', inputArray, [1, 224, 224, 3])
        };
      }

      return {
        input: inputArray
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
    // Prefer dedicated image session if available
    const session = this.imageSession || this.session;

    if (!session) {
      return this.mockImageInference(imageBuffer);
    }

    try {
      const inputs = await this.preprocessImage(imageBuffer);
      const outputs = await session.run(inputs);

      const predictions = outputs[session.outputNames[0]];
      const scores = Array.from(predictions.data);
      const probabilities = this.softmax(scores);

      return {
        isFiltered: probabilities[1] > 0.5,
        confidence: Math.max(...probabilities),
        scores: probabilities,
        modelUsed: (this.imageModelMetadata || this.modelMetadata || {}).modelPath,
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
      metadata: {
        text: this.modelMetadata,
        image: this.imageModelMetadata
      },
      capabilities: ['text_classification', 'image_classification']
    };
  }

  /**
   * Close the inference session
   */
  async close() {
    if (this.session) {
      try { await this.session.release(); } catch(e) { /* ignore */ }
      this.session = null;
    }

    if (this.imageSession) {
      try { await this.imageSession.release(); } catch(e) { /* ignore */ }
      this.imageSession = null;
    }

    this.isLoaded = false;
  }
}

module.exports = AIInferenceEngine;