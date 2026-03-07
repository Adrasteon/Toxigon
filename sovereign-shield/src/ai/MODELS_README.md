# Models

Place ONNX models in this directory (or update the path passed to the AIInferenceEngine constructor).

- Default model path used by the engine: `./models/content_classifier.onnx`
- Recommended format: ONNX (quantized TinyML models preferred for low-latency inference)
- Ensure model input/output nodes match the preprocessing and postprocessing implemented in src/ai/inferenceEngine.js

Deployment notes:
- For development, a mock classifier is used when no model is present or ONNX Runtime isn't installed.
- In production, install `onnxruntime-node` and place optimized models in the models/ directory.
