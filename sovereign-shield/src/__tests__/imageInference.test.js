const AIInferenceEngine = require('../ai/inferenceEngine');

describe('AIInferenceEngine (image mock behavior)', () => {
  test('returns mock image classification when image model missing', async () => {
    const engine = new AIInferenceEngine('./models/nonexistent-text.onnx', './models/nonexistent-image.onnx');
    await engine.init();

    const buf = Buffer.alloc(1024); // small dummy image buffer
    const res = await engine.classifyImage(buf);

    expect(res).toHaveProperty('isFiltered');
    expect(typeof res.confidence).toBe('number');
    expect(Array.isArray(res.scores)).toBe(true);
    expect(res.modelUsed).toBe('mock_image_classifier');
  });
});
