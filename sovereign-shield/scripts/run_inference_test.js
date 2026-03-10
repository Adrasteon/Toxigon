const AIInferenceEngine = require('../src/ai/inferenceEngine');

(async () => {
  const engine = new AIInferenceEngine();
  console.log('Initializing AIInferenceEngine...');
  await engine.init();
  console.log('isLoaded:', engine.isLoaded);
  console.log('Model info:', engine.getModelInfo());

  const sample = 'This message includes hate and violence and should be filtered.';
  try {
    const result = await engine.classifyContent(sample, 'text');
    console.log('Inference result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error during inference:', e);
  }

  await engine.close();
  console.log('Engine closed.');
})();
