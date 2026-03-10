import os
import sys
from pathlib import Path

MODEL_IN = Path('models/content_classifier.onnx')
MODEL_OUT_DYNAMIC = Path('models/content_classifier.dynamic.quant.onnx')
MODEL_OUT_STATIC = Path('models/content_classifier.static.quant.onnx')

if not MODEL_IN.exists():
    print('Input ONNX model not found:', MODEL_IN)
    sys.exit(2)

try:
    from onnxruntime.quantization import quantize_dynamic, QuantType
except Exception as e:
    print('onnxruntime.quantization import failed:', e)
    sys.exit(3)

# Try dynamic quantization (weights only)
print('Attempting dynamic quantization...')
try:
    quantize_dynamic(str(MODEL_IN), str(MODEL_OUT_DYNAMIC), weight_type=QuantType.QInt8, per_channel=False, op_types_to_quantize=['MatMul','Gemm','Conv'])
    print('Dynamic quantization succeeded, output:', MODEL_OUT_DYNAMIC)
except Exception as e:
    print('Dynamic quantization failed:', e)

# Attempt static quantization using a small calibration dataset
print('\nAttempting static quantization with tokenizer-based calibration...')
try:
    from onnxruntime.quantization import quantize_static
    from onnxruntime.quantization import CalibrationDataReader
    from transformers import AutoTokenizer
    import numpy as np

    class TokenizerDataReader(CalibrationDataReader):
        def __init__(self, tokenizer, texts, max_length=128):
            self._data = []
            for t in texts:
                enc = tokenizer(t, max_length=max_length, truncation=True, padding='max_length', return_tensors='np')
                # Convert to ndarray (numpy)
                sample = {}
                for k,v in enc.items():
                    # ensure dtype int64 for ids
                    if v.dtype == object:
                        arr = np.array(v)
                    else:
                        arr = v
                    # squeeze batch dimension
                    if hasattr(arr, 'squeeze'):
                        arr = np.squeeze(arr, axis=0)
                    sample[k] = arr
                self._data.append(sample)
            self._iter = iter(self._data)

        def get_next(self):
            try:
                return next(self._iter)
            except StopIteration:
                return None

        def rewind(self):
            self._iter = iter(self._data)

    tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
    # Small calibration corpus - varied short sentences
    texts = [
        'This is a test.', 'Hello world.', 'I love open source.', 'This is toxic content.',
        'Please moderate this content.', 'Short sentence.', 'Another example.', 'Neutral statement.'
    ] * 8

    dr = TokenizerDataReader(tokenizer, texts, max_length=128)
    quantize_static(str(MODEL_IN), str(MODEL_OUT_STATIC), dr, per_channel=False, weight_type=QuantType.QInt8)
    print('Static quantization succeeded, output:', MODEL_OUT_STATIC)
except Exception as e:
    print('Static quantization failed:', e)
    import traceback
    traceback.print_exc()

print('\nDone')
