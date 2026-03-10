const fs = require('fs');
const path = require('path');

const src = process.env.LOCAL_MODEL_PATH || process.argv[2];
if (!src) {
  console.error('Please provide a model path via LOCAL_MODEL_PATH env var or as first argument.');
  process.exit(1);
}

if (!fs.existsSync(src)) {
  console.error('Provided model file does not exist:', src);
  process.exit(1);
}

const modelsDir = path.join(process.cwd(), 'models');
if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

const destText = path.join(modelsDir, 'content_classifier.onnx');
const destImage = path.join(modelsDir, 'image_classifier.onnx');

try {
  fs.copyFileSync(src, destImage);
  if (!fs.existsSync(destText)) fs.copyFileSync(src, destText);
  console.log('Copied model to:', destImage);
  console.log('Ensured text model at:', destText);
} catch (err) {
  console.error('Failed to copy model:', err);
  process.exit(1);
}
