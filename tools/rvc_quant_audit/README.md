# RVC ONNX export and INT8 audit harness

This directory is an **offline host tool**, intentionally separate from the React Native application. It does not download model weights. Users provide local ONNX files and local calibration audio; generated reports are reproducible from those inputs.

## Install

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r tools/rvc_quant_audit/requirements.txt
```

The mobile app does not consume these dependencies. Keep `onnx`, `onnxruntime`, `numpy`, and any exporter framework in this host environment only.

## Synthetic smoke test

```bash
python tools/rvc_quant_audit/rvc_quant_audit.py synthetic-fixtures /tmp/rvc-fixtures --count 4
python tools/rvc_quant_audit/rvc_quant_audit.py validate-manifest /tmp/rvc-fixtures/calibration.jsonl
```

For a local model, inspect the graph, run ONNX shape inference, validate the opset, and list operator coverage:

```bash
python tools/rvc_quant_audit/rvc_quant_audit.py inspect /models/contentvec_v2.onnx --json
```

The Python API exposes `quantize_dynamic` and `quantize_static_qdq`. The latter must be passed a calibration reader built by the caller from the validated JSONL manifest. Both APIs accept `excluded_ops`, so exclusions are explicit and recorded in the report rather than silently inferred.

## Required pipeline inputs

| Component | Input/artifact | Audit boundary | Default decision |
|---|---|---|---|
| Content encoder | ContentVec/RVC v1 or v2 ONNX | waveform/features to content features | Run dynamic and static QDQ experiments; accept only after parity gate |
| Pitch extractor | RMVPE ONNX | waveform to f0/voicing | Remain fp32; octave errors are high risk |
| Per-voice generator | `net_g` ONNX for one voice | units + f0 + speaker conditioning to waveform | Remain fp32 until audio parity and listening gates pass |
| Retrieval | Optional FAISS/index artifact | feature lookup and blend ratio | Not an ONNX graph; audit lookup separately |
| Preprocessing | local/native code | resampling, normalization, framing | Keep deterministic and native/fp32 |
| Postprocessing | local/native code | overlap-add, denormalization, WAV encoding | Keep deterministic and native/fp32 |

A v1/v2 manifest must identify the model family, sample rate, hop length, feature dimensionality, and voice artifact set. Do not mix ContentVec v1 and v2 contracts or use an index trained against a different feature space.

## Calibration provenance

Calibration manifests are JSONL, one local audio record per line. Each record should include `audio`, `sample_rate`, `purpose`, and a stable `seed` or source identifier. The harness rejects missing files, records the resolved local paths, and reports provenance as either `synthetic_sine_fixture` or `user-supplied-local-manifest`. No remote URLs are accepted by the manifest validator.

## Audit report requirements

A complete report should contain `audit.json` and `audit.md`, with model byte sizes, opset, inferred input/output shapes, operator coverage, excluded operators, quantization representation, calibration provenance, FP32-vs-INT8 MAE/RMSE/max error/cosine/SNR/exact-match metrics, warm-up-adjusted CPU latency (mean, p50, p95), and a component quality-risk decision. For audio outputs, compare equal-length waveform arrays and additionally evaluate listening/ASR gates outside this numeric harness.

## Export and quantization procedure

Export each component independently with stable named inputs and outputs. Validate the FP32 graph and run shape inference before quantization. Produce two experiments: dynamic INT8, and static QDQ INT8 using representative local calibration. Preserve the original FP32 graph. Exclude unsupported or quality-sensitive nodes explicitly, then rerun parity and latency. QDQ is preferred for inspectability; the mobile artifact must be a self-contained ONNX model plus metadata, not a conversion script.

The conservative shipping policy is to keep RMVPE, `net_g`, preprocessing, and postprocessing in FP32/native code. ContentVec is an experiment candidate, not automatically safe. Retrieval stays in its original index format. A component is eligible for INT8 only when shape/opset validation passes and numerical, audio, latency, and quality-risk gates are recorded.

## References

1. [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)
2. [voiceclonnx pure-ONNX reference](https://github.com/TigreGotico/voiceclonnx)
