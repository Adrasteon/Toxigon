const AIInferenceEngine = require('../ai/inferenceEngine');

describe('AIInferenceEngine (mock behavior)', () => {
  test('returns classification structure when model missing', async () => {
    const engine = new AIInferenceEngine('./models/nonexistent-model.onnx');
    await engine.init();
    const res = await engine.classifyContent('This is a spam message');

    expect(res).toHaveProperty('isFiltered');
    expect(typeof res.confidence).toBe('number');
    expect(Array.isArray(res.scores)).toBe(true);
    expect(res).toHaveProperty('modelUsed');
  });

  test('getModelInfo returns capabilities', async () => {
    const engine = new AIInferenceEngine('./models/nonexistent-model.onnx');
    await engine.init();
    const info = engine.getModelInfo();
    expect(info).toHaveProperty('capabilities');
    expect(info.capabilities).toContain('text_classification');
  });
});
