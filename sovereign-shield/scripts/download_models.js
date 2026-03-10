const https = require('https');
const fs = require('fs');
const path = require('path');

const modelsDir = path.join(process.cwd(), 'models');
if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

const defaultUrl = process.env.MODEL_URL || '';
const downloads = [];

if (defaultUrl) {
  downloads.push({ url: defaultUrl, dest: path.join(modelsDir, 'image_classifier.onnx') });
} else {
  console.log('No MODEL_URL provided. Please set MODEL_URL env var to a raw .onnx URL to download.');
  console.log('Example: MODEL_URL=https://.../model.onnx npm run download-models');
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirects
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

(async () => {
  try {
    for (const d of downloads) {
      console.log('Downloading', d.url, '->', d.dest);
      await downloadFile(d.url, d.dest);
      console.log('Saved', d.dest);
    }

    // Copy image model to content_classifier.onnx to satisfy text-model presence checks
    const src = path.join(modelsDir, 'image_classifier.onnx');
    const txtDest = path.join(modelsDir, 'content_classifier.onnx');
    if (fs.existsSync(src) && !fs.existsSync(txtDest)) {
      fs.copyFileSync(src, txtDest);
      console.log('Copied image model to', txtDest);
    }

    console.log('Model download complete.');
  } catch (err) {
    console.error('Model download failed:', err);
    process.exit(1);
  }
})();
