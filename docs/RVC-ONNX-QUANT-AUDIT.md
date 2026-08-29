# Reproducible RVC ONNX export and INT8 audit

This runbook defines an **offline** audit for the complete RVC boundary: preprocessing, ContentVec content features, RMVPE pitch, optional retrieval, per-voice `net_g`, and postprocessing. Conversion and audit dependencies live only in `tools/rvc_quant_audit`; they are not mobile runtime dependencies.

> No copyrighted or community model weights belong in this repository. Every command below accepts local paths and produces reports from synthetic or user-supplied fixtures.

## Quick start with synthetic inputs

```bash
python3 tools/rvc_quant_audit/rvc_quant_audit.py synthetic-fixtures /tmp/rvc-fixtures --count 4
python3 tools/rvc_quant_audit/rvc_quant_audit.py validate-manifest /tmp/rvc-fixtures/calibration.jsonl
```

Install the host-only conversion environment before ONNX operations:

```bash
python3 -m venv /tmp/rvc-audit-venv
. /tmp/rvc-audit-venv/bin/activate
python -m pip install -r tools/rvc_quant_audit/requirements.txt
python tools/rvc_quant_audit/export_onnx.py /tmp/rvc-fixtures/contentvec_v2.onnx --component content_encoder
python tools/rvc_quant_audit/rvc_quant_audit.py inspect /tmp/rvc-fixtures/contentvec_v2.onnx --json
python tools/rvc_quant_audit/rvc_quant_audit.py audit \
  --model content_encoder=/tmp/rvc-fixtures/contentvec_v2.onnx \
  --manifest /tmp/rvc-fixtures/calibration.jsonl \
  --out /tmp/rvc-audit-report
```

The exporter creates a tiny deterministic graph for smoke testing only. It is not an RVC model exporter and contains no learned weights. Real exports should be performed per component by a host-side exporter and then passed through the same inspection and parity gates.

## Component matrix and shipping decisions

| Component                | RVC role                                                      | v1/v2 compatibility                                    | Quantization experiment     | Default shipping decision                      |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------ | --------------------------- | ---------------------------------------------- |
| ContentVec               | Produces content embeddings consumed by `net_g`               | Do not mix v1 and v2 feature dimensions or checkpoints | Dynamic INT8 and static QDQ | Candidate only after parity and quality gates  |
| RMVPE                    | Produces f0 and voicing contour                               | Match sample rate and hop length                       | No INT8 by default          | Keep FP32; pitch errors are high risk          |
| Per-voice `net_g`        | Synthesizes waveform from units, f0, and speaker conditioning | One artifact and metadata set per voice/model version  | No INT8 by default          | Keep FP32 until audio parity passes            |
| Optional retrieval/index | Blends nearest feature vectors                                | Index must match ContentVec family and feature space   | Not applicable              | Preserve native index; audit lookup separately |
| Preprocessing            | Resampling, normalization, framing, f0 preparation            | Must match the model contract                          | Native/fp32                 | Keep deterministic native code                 |
| Postprocessing           | Overlap-add, denormalization, waveform encoding               | Must preserve expected sample rate                     | Native/fp32                 | Keep deterministic native code                 |

The initial safe policy is intentionally conservative: **only ContentVec is an INT8 experiment candidate**. A report must state any accepted or rejected QDQ/dynamic experiment and every excluded operator. `net_g`, RMVPE, and the audio boundary remain FP32 unless a later report supplies numeric, audio, latency, and quality evidence.

## Export and audit protocol

First export each graph with stable named inputs and outputs. Run ONNX checker, opset validation, and shape inference before quantization. Run both dynamic INT8 and static QDQ experiments where the component policy permits them. Static QDQ must use a representative local JSONL calibration manifest. The manifest validator resolves only local files and records provenance; remote URLs are rejected by design.

For every FP32/INT8 pair, compare equal-shaped outputs with MAE, RMSE, maximum absolute error, cosine similarity, SNR, and exact-match rate. For waveform outputs, retain those metrics as audio parity metrics and add an external listening or ASR gate before shipping. Benchmark after warm-up and report mean, p50, and p95 CPU latency. Report model bytes, operator counts, opset, inferred shapes, quantization format, calibration provenance, and excluded operators.

The harness exposes `quantize_dynamic` and `quantize_static_qdq` functions. Both accept `excluded_ops`; exclusions must be passed explicitly and copied into the report. QDQ is preferred for inspectability because quantize/dequantize boundaries remain visible in the graph. Keep the original FP32 model beside every candidate artifact so regressions are reversible.

## Expected mobile artifacts

Mobile should receive a validated, self-contained ONNX graph plus a small metadata document containing the RVC family (`v1` or `v2`), model opset, sample rate, hop length, feature dimension, voice identifier, and whether retrieval is enabled. A voice bundle may include a FP32 ContentVec or accepted INT8 ContentVec, FP32 RMVPE, FP32 per-voice `net_g`, and the optional native retrieval index. Mobile must not receive calibration audio, exporter code, conversion dependencies, or network download instructions.

## References

1. [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)
2. [voiceclonnx pure-ONNX reference](https://github.com/TigreGotico/voiceclonnx)
