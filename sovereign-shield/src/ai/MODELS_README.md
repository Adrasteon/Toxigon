# Models

Place ONNX models in this directory (or update the path passed to the AIInferenceEngine constructor).

- Default model path used by the engine: `./models/content_classifier.onnx`
- Recommended format: ONNX (quantized TinyML models preferred for low-latency inference)
- Ensure model input/output nodes match the preprocessing and postprocessing implemented in `src/ai/inferenceEngine.js`

Repository policy:
- Large model files are intentionally not tracked in git. The repository `.gitignore` excludes the `models/` directory and common model binary formats (e.g. `*.onnx`, `*.pt`).

How to get a model locally:

1. Create the models directory if it doesn't exist:

```bash
npm run ensure-models
```

2a. Download a prebuilt ONNX model:

```bash
# supply MODEL_URL pointing to a raw ONNX file
MODEL_URL="https://example.com/path/to/model.onnx" npm run download-models
```

2b. Or build/convert locally from a Hugging Face checkpoint (requires Python and dependencies):

```bash
python scripts/convert_hf_to_onnx.py --model sentence-transformers/all-MiniLM-L6-v2 --output models/content_classifier.onnx
```

Notes:
- Development: a mock classifier is used when no model is present or ONNX Runtime isn't installed.
- Production: install `onnxruntime-node` and place optimized models in the `models/` directory or host them in your artifact store.
