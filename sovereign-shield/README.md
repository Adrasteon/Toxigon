# Sovereign Shield

**Privacy-First Content Moderation Framework**

Sovereign Shield is a decentralized content-moderation framework that places the power to define "safety" and "tolerance" directly in the hands of the consumer, bypassing the patchy and profit-driven moderation of multinational corporations.

## 🎯 Vision

Shift digital safety from corporate-centric "one-size-fits-all" moderation to **Individual Sovereign Control**. All content analysis and policy enforcement occur on the user's local hardware, ensuring private data never leaves the user's control.

## 🚀 Features

### Core Capabilities
- **1-10 Sensitivity Scale**: Granular control over content filtering
- **Local AI Inference**: ONNX Runtime with quantized TinyML models
- **Real-time Content Substitution**: Replace flagged content with placeholders
- **Privacy-First**: All processing happens locally on user devices
- **Cross-Platform**: Windows, macOS, Android, iOS support

### Technical Highlights
- **Sub-20ms Latency**: Optimized for real-time content filtering
- **Hardware Acceleration**: NPU support for line-rate AI inference
- **Cloud Threat Exchange**: Community-driven threat intelligence
- **System Proxy Integration**: OS-level content interception
- **VPN Service**: Mobile traffic filtering for all network devices

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Desktop App   │    │   Mobile App     │    │   Cloud Threat  │
│                 │    │                  │    │   Exchange      │
│ • Policy Config │◄──►│ • VPN Service    │◄──►│ • Threat        │
│ • System Proxy  │    │ • Content Filter │    │   Intelligence  │
│ • Monitoring    │    │ • Local Storage  │    │ • Updates       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Core Engine   │
                    │                 │
                    │ • Policy Engine │
                    │ • AI Inference  │
                    │ • Content Filter│
                    │ • Security Mgmt │
                    └─────────────────┘
```

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Python 3.8+ (for native dependencies)

### Quick Start

1. **Clone and Install**
```bash
git clone <repository-url>
cd sovereign-shield
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start the Application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

4. **Access the API**
- Health Check: `http://localhost:3000/health`
- API Documentation: `http://localhost:3000/api/docs`

## Models

The repository does not track large ML model files. Models are large ONNX blobs and are intentionally excluded from version control to keep the repository lightweight.

- Default model path used by the engine: `./models/content_classifier.onnx`
- For development you can create the `models` directory and place models there, or use the helper scripts below to download or build the model locally.

Commands:

```bash
# ensure the models directory exists
npm run ensure-models

# download a prebuilt model (set MODEL_URL to a raw file URL)
MODEL_URL="https://example.com/path/to/model.onnx" npm run download-models

# check that the expected model is present
npm run check-models

# convert a Hugging Face checkpoint to ONNX (requires Python tooling)
python scripts/convert_hf_to_onnx.py --model sentence-transformers/all-MiniLM-L6-v2 --output models/content_classifier.onnx
```

Notes:
- Models are intentionally excluded from git (see `.gitignore`). Add them to your local `.git/info/exclude` or another artifact store if you need to persist a specific build.
- Quantization attempts may be experimental and are not included by default — see `scripts/quantize_attempt.py`.

Runtime choice — Node vs Python
--------------------------------

- Recommendation: for runtime in this Electron/Node application prefer the Node bindings (`onnxruntime-node`). This keeps production installs smaller (no Python venv or heavy ML toolchain), integrates directly with the server/UI, and uses the same ONNX Runtime core for comparable inference speed.

- Use Python (`onnxruntime`) for offline tooling: model conversion, calibration, and quantization (see `scripts/convert_hf_to_onnx.py` and `scripts/quantize_attempt.py`). Keep Python tooling in developer environments and avoid bundling Python into production builds.

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Security
SOVEREIGN_ENCRYPTION_KEY=your-256-bit-key-here

# Cloud Threat Exchange
THREAT_EXCHANGE_API_KEY=your-api-key
USER_ID=your-user-id

# Allowed Origins (CORS)
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.com
```

### Policy Configuration

```javascript
// Example policy setup
const policy = {
  sensitivityLevel: 7,        // 1 (Lax) to 10 (Strict)
  parentalFloor: 5,           // Minimum protection level
  customKeywords: ['spam', 'scam'],
  blockedCategories: ['violence', 'adult']
};
```

## 🛡️ Security Features

### Data Protection
- **AES-256 Encryption**: All local data encrypted at rest
- **Secure Storage**: Encrypted policy databases with file permissions
- **Session Management**: Secure token-based authentication
- **Brute Force Protection**: Automatic lockout after failed attempts

### Privacy Guarantees
- **Local Processing**: No content leaves user device
- **Anonymous Threat Reporting**: Hash-based threat signatures only
- **Zero Data Collection**: No user behavior tracking
- **End-to-End Encryption**: All cloud communications encrypted

## 🌐 API Reference

### Policy Management

#### Get User Policy
```http
GET /api/policy/{userId}
```

#### Set User Policy
```http
POST /api/policy/{userId}
Content-Type: application/json

{
  "sensitivityLevel": 7,
  "parentalFloor": 5,
  "customKeywords": ["spam", "scam"],
  "blockedCategories": ["violence", "adult"]
}
```

### Content Filtering

#### Filter Single Content
```http
POST /api/filter
Content-Type: application/json

{
  "userId": "user123",
  "content": "This is potentially inappropriate content",
  "contentType": "text",
  "context": "chat"
}
```

#### Filter Multiple Content
```http
POST /api/filter/batch
Content-Type: application/json

{
  "userId": "user123",
  "contentItems": [
    {
      "id": "item1",
      "content": "Content 1",
      "type": "text",
      "context": "email"
    },
    {
      "id": "item2", 
      "content": "Content 2",
      "type": "image",
      "context": "web"
    }
  ]
}
```

### System Management

#### Start System Proxy
```http
POST /api/proxy/start
```

#### Get Proxy Status
```http
GET /api/proxy/status
```

#### Security Audit
```http
POST /api/security/audit
```

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm test

# Linting
npm run lint

# Code formatting
npm run format
```

### Integration Testing
```bash
# Start test environment
npm run test:integration

# Performance testing
npm run test:performance
```

## 📱 Desktop Application

### Running the Electron app locally

1. Ensure dependencies installed: `npm install`
2. Start the server API (if desired): `npm run dev` or `npm start`
3. Launch the Electron app (separate process): `npm run electron:dev`

Note: the Electron app will spawn a detached background service that manages the system proxy. Use the tray menu or app settings to control auto-start and the background service.


### Windows/macOS/Linux Support
- **Electron-based**: Cross-platform desktop application
- **System Tray**: Always-accessible control panel
- **Native Notifications**: Real-time filtering alerts
- **Auto-start**: Optional system startup integration

### Features
- Policy configuration UI
- Real-time filtering statistics
- Threat intelligence dashboard
- System status monitoring

## 📱 Mobile Application

### Android/iOS Support
- **React Native**: Native mobile experience
- **VPN Service**: System-level traffic filtering
- **Background Processing**: Always-on protection
- **Battery Optimized**: Minimal resource usage

### Features
- Sensitivity slider control
- Network status monitoring
- Protection statistics
- Export filtering logs

## ☁️ Cloud Threat Exchange

### Community Intelligence
- **Anonymous Threat Sharing**: Hash-based threat signatures
- **Real-time Updates**: Automatic threat database updates
- **Global Protection**: Community-vetted threat intelligence
- **Privacy Preserving**: No user data collection

### Threat Categories
- Malware and phishing
- Hate speech and harassment
- Adult content
- Violence and gore
- Scams and fraud

## 🔒 Security Best Practices

### For Developers
1. **Environment Variables**: Never commit secrets to version control
2. **Input Validation**: Always validate and sanitize user inputs
3. **Error Handling**: Don't expose sensitive information in error messages
4. **Dependencies**: Keep all dependencies up to date
5. **Code Review**: Implement peer review for security-critical code

### For Users
1. **Strong Passwords**: Use complex, unique passwords
2. **Regular Updates**: Keep the application updated
3. **Trusted Sources**: Only install from official sources
4. **Monitor Activity**: Regularly check filtering statistics
5. **Backup Policies**: Export and backup important policy configurations

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for your changes
5. Run the test suite
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Privacy Advocates**: For their tireless work protecting digital rights
- **Open Source Community**: For providing the tools and libraries that make this possible
- **Security Researchers**: For their work in threat detection and analysis
- **Users**: For demanding better privacy and control over their digital lives

## 📞 Support

- **Documentation**: [API Docs](http://localhost:3000/api/docs)
- **Issues**: [GitHub Issues](https://github.com/your-repo/sovereign-shield/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/sovereign-shield/discussions)
- **Email**: support@sovereignshield.io

---

**Sovereign Shield**: Taking back control of your digital safety, one choice at a time. 🛡️