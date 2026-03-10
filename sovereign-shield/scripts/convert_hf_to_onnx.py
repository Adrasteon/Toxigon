#!/usr/bin/env python3
import argparse
import os
import sys

try:
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import onnx
    import onnxruntime as ort
except Exception as e:
    print('Missing Python dependencies. Please install torch, transformers, onnx, onnxruntime')
    print(e)
    sys.exit(2)

from pathlib import Path

parser = argparse.ArgumentParser(description='Convert HF model to ONNX')
parser.add_argument('--model', '-m', default=os.environ.get('MODEL_NAME', 'AssistantsLab/Tiny-Toxic-Detector'))
parser.add_argument('--output', '-o', default='models/content_classifier.onnx')
parser.add_argument('--max_length', type=int, default=128)
parser.add_argument('--opset', type=int, default=13)
parser.add_argument('--quantize', action='store_true')
args = parser.parse_args()

model_name = args.model
output_path = Path(args.output)
output_path.parent.mkdir(parents=True, exist_ok=True)

print('Model:', model_name)
print('Output:', output_path)
print('Max length:', args.max_length)
print('OPSET:', args.opset)

# Load model and tokenizer
print('Loading model and tokenizer...')
try:
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)
    model.eval()
except Exception as e:
    print('Failed to load model/tokenizer:', e)
    sys.exit(3)

# Prepare dummy input
text = "This is a test input for ONNX export"
inputs = tokenizer(text, return_tensors='pt', truncation=True, padding='max_length', max_length=args.max_length)

# Move model to CPU
device = torch.device('cpu')
model.to(device)
for k in inputs:
    inputs[k] = inputs[k].to(device)

# Build input tuple and input names/dtypes
input_names = []
input_tensors = []
dynamic_axes = {}
for name in ['input_ids', 'attention_mask', 'token_type_ids']:
    if name in inputs:
        input_names.append(name)
        input_tensors.append(inputs[name])
        dynamic_axes[name] = {0: 'batch', 1: 'seq'}

output_names = ['logits']
# export
print('Exporting to ONNX...')
try:
    torch.onnx.export(
        model,
        tuple(input_tensors) if len(input_tensors) > 1 else input_tensors[0],
        str(output_path),
        input_names=input_names,
        output_names=output_names,
        opset_version=args.opset,
        dynamic_axes={**{n: {0: 'batch', 1: 'seq'} for n in input_names}, 'logits': {0: 'batch'}},
        do_constant_folding=True,
        verbose=False,
    )
except Exception as e:
    print('ONNX export failed:', e)
    sys.exit(4)

print('Checking ONNX model...')
try:
    onnx_model = onnx.load(str(output_path))
    onnx.checker.check_model(onnx_model)
except Exception as e:
    print('ONNX check failed:', e)
    sys.exit(5)

print('Running a quick ONNX Runtime inference to validate...')
try:
    sess = ort.InferenceSession(str(output_path), providers=['CPUExecutionProvider'])
    ort_inputs = {}
    for name in input_names:
        ort_inputs[name] = inputs[name].cpu().numpy()
    out = sess.run(None, ort_inputs)
    print('ONNX Runtime output shapes:', [o.shape for o in out])
except Exception as e:
    print('ONNX Runtime inference failed:', e)
    sys.exit(6)

if args.quantize:
    print('Quantizing ONNX model (dynamic quantization)...')
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quant_path = str(output_path.with_suffix('.quant.onnx'))
        quantize_dynamic(str(output_path), quant_path, weight_type=QuantType.QInt8)
        print('Quantized model saved to', quant_path)
    except Exception as e:
        print('Quantization failed:', e)
        sys.exit(7)

print('Conversion complete.')
print('Output file:', output_path)

sys.exit(0)
