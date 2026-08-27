# RVC quantization audit source notes

## ONNX Runtime quantization guidance

Source: https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html

The guidance defines 8-bit linear quantization and distinguishes operator-oriented QOperator graphs from tensor-oriented QDQ graphs. Static QDQ carries calibration-derived quantization parameters in QuantizeLinear/DequantizeLinear nodes; dynamic quantization computes parameters at runtime. The page recommends shape inference before quantization and documents quantization debugging helpers for matching activations and weights between float and quantized models. Quantization must preserve exact representation of zero because padding can otherwise introduce errors.

## Pure-ONNX reference

Source: https://github.com/TigreGotico/voiceclonnx

The reference project uses pure ONNX at runtime, keeps conversion under a separate `conversion/` directory, publishes component parity and quantized comparison reports, and uses explicit `*_q8.onnx` artifacts. Its README states that quantized variants are smaller/faster but carry a measured quality cost. This project is used as a pattern reference only; no model weights or generated artifacts are copied.

## Repository baseline note

The target repository currently exposes `origin/pocketpal-lite` as its default and only remote branch; `origin/main` does not exist. The requested feature branch is therefore based on the checked-out default branch (`origin/pocketpal-lite`) while the PR target will be verified against available branches before creation.
