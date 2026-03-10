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

Runtime choice — Node vs Python
--------------------------------

- Recommendation: for this repository and the Electron/Node-based application, use the Node bindings (`onnxruntime-node`). It provides the best integration with the existing codebase, avoids adding a Python runtime and heavy conversion dependencies to production installs, and gives comparable raw inference speed because both bindings use the same ONNX Runtime C++ core.

- Why Node: minimal extra runtime footprint for the app (no Python venv, no torch required), direct in-process calls from the server/UI, and simpler packaging with Electron.

- Why Python (when to use): use Python `onnxruntime` when you need the mature Python ecosystem for model conversion, calibration, quantization, or heavy experimentation (scripts in `scripts/` use Python). Python is useful for offline model tooling but typically increases install size if included in production.

- Install:

	- Node (recommended for runtime):

		```bash
		npm install onnxruntime-node
		```

	- Python (tooling / conversion):

		```bash
		python -m pip install onnxruntime
		```

Notes:
- For GPU acceleration, install the appropriate ONNX Runtime GPU package for your platform (e.g., `onnxruntime-gpu` or the GPU-enabled Node bindings) and adjust the session providers accordingly.
- Model conversion and quantization workflows still rely on Python tooling in `scripts/`; keep those tools scoped to developer environments and not bundled with production installs.
