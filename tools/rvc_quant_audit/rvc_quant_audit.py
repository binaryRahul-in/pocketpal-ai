#!/usr/bin/env python3
"""Reproducible, offline RVC ONNX inspection, quantization, and parity audit.

The module deliberately keeps all conversion dependencies in this host-side directory.
It never downloads model weights; callers provide local ONNX files and calibration audio.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

COMPONENTS = (
    "content_encoder",
    "pitch_extractor",
    "voice_generator",
    "retrieval_index",
    "preprocessing",
    "postprocessing",
)

@dataclass(frozen=True)
class ComponentPolicy:
    component: str
    role: str
    quantization: str
    quality_risk: str
    exclusion_reason: str = ""

POLICIES = (
    ComponentPolicy("content_encoder", "ContentVec features; RVC v1/v2 input contract", "qdq_static_and_dynamic_experiment", "high"),
    ComponentPolicy("pitch_extractor", "RMVPE f0 contour", "fp32_only", "high", "Pitch errors compound with net_g and create audible octave/voicing artifacts."),
    ComponentPolicy("voice_generator", "Per-voice net_g/vocoder", "fp32_only", "high", "Keep synthesis recurrent/convolutional path in fp32 until measured audio parity passes."),
    ComponentPolicy("retrieval_index", "Optional FAISS/index feature retrieval", "not_applicable", "none", "Index is not an ONNX graph; audit lookup separately and preserve original index format."),
    ComponentPolicy("preprocessing", "Resampling, normalization, framing, f0 preparation", "fp32_or_native", "medium", "Deterministic host/native code is outside ONNX quantization."),
    ComponentPolicy("postprocessing", "Overlap-add, denormalization, waveform encoding", "fp32_or_native", "medium", "Keep waveform assembly and file encoding outside quantized graph."),
)

@dataclass
class ModelInspection:
    path: str
    size_bytes: int
    opset: int | None
    ir_version: int | None
    inputs: list[dict[str, Any]]
    outputs: list[dict[str, Any]]
    operators: dict[str, int]
    operator_count: int
    inferred_shapes: bool
    validation_errors: list[str] = field(default_factory=list)

@dataclass
class Metrics:
    samples: int
    mae: float
    rmse: float
    max_abs_error: float
    cosine_similarity: float
    snr_db: float
    exact_match_rate: float


def _shape(value_info: Any) -> list[Any]:
    tensor = value_info.type.tensor_type
    result = []
    for dim in tensor.shape.dim:
        if dim.HasField("dim_value"):
            result.append(dim.dim_value)
        elif dim.HasField("dim_param"):
            result.append(dim.dim_param)
        else:
            result.append(None)
    return result


def inspect_model(path: str | Path, infer_shapes: bool = True) -> ModelInspection:
    """Inspect an ONNX model and validate its opset and tensor contracts."""
    try:
        import onnx
    except ImportError as exc:
        raise RuntimeError("Model inspection requires the host extra: pip install -r tools/rvc_quant_audit/requirements.txt") from exc
    model_path = Path(path)
    model = onnx.load(str(model_path), load_external_data=False)
    errors = []
    opsets = [o.version for o in model.opset_import if o.domain in ("", "ai.onnx")]
    opset = max(opsets) if opsets else None
    if opset is None:
        errors.append("model has no default-domain opset import")
    if opset is not None and not 11 <= opset <= 21:
        errors.append(f"opset {opset} is outside the supported audit range 11..21")
    inferred = False
    if infer_shapes:
        try:
            model = onnx.shape_inference.infer_shapes(model)
            inferred = True
        except Exception as exc:  # shape inference can be partial for custom ops
            errors.append(f"shape inference failed: {exc}")
    operators: dict[str, int] = {}
    for node in model.graph.node:
        operators[node.op_type] = operators.get(node.op_type, 0) + 1
    inputs = [{"name": x.name, "shape": _shape(x), "dtype": x.type.tensor_type.elem_type} for x in model.graph.input]
    outputs = [{"name": x.name, "shape": _shape(x), "dtype": x.type.tensor_type.elem_type} for x in model.graph.output]
    errors.extend(_contract_errors(inputs, outputs))
    return ModelInspection(str(model_path), model_path.stat().st_size, opset, model.ir_version, inputs, outputs, dict(sorted(operators.items())), len(model.graph.node), inferred, errors)


def _contract_errors(inputs: list[dict[str, Any]], outputs: list[dict[str, Any]]) -> list[str]:
    errors = []
    if not inputs:
        errors.append("model has no graph inputs")
    if not outputs:
        errors.append("model has no graph outputs")
    for tensor in inputs + outputs:
        if not tensor["name"]:
            errors.append("tensor has an empty name")
    return errors


def _as_array(value: Any):
    import numpy as np
    return np.asarray(value, dtype=np.float32).reshape(-1)


def compare_outputs(reference: Any, candidate: Any, exact_tolerance: float = 1e-5) -> Metrics:
    """Calculate deterministic numerical and audio-parity metrics."""
    import numpy as np
    ref, cand = _as_array(reference), _as_array(candidate)
    if ref.shape != cand.shape:
        raise ValueError(f"output shape mismatch: {ref.shape} != {cand.shape}")
    delta = cand - ref
    ref_norm, cand_norm = float(np.linalg.norm(ref)), float(np.linalg.norm(cand))
    cosine = float(np.dot(ref, cand) / (ref_norm * cand_norm)) if ref_norm and cand_norm else 1.0 if not (ref_norm or cand_norm) else 0.0
    noise = float(np.sum(delta * delta))
    signal = float(np.sum(ref * ref))
    snr = float(10 * math.log10(signal / noise)) if noise > 0 and signal > 0 else float("inf")
    return Metrics(int(ref.size), float(np.mean(np.abs(delta))), float(np.sqrt(np.mean(delta * delta))), float(np.max(np.abs(delta))) if delta.size else 0.0, cosine, snr, float(np.mean(np.abs(delta) <= exact_tolerance)))


def _session(path: str | Path):
    try:
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError("Inference requires the host extra: pip install -r tools/rvc_quant_audit/requirements.txt") from exc
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def run_model(path: str | Path, feeds: dict[str, Any]) -> list[Any]:
    session = _session(path)
    return session.run(None, feeds)


def benchmark(path: str | Path, feeds: dict[str, Any], iterations: int = 10) -> dict[str, float]:
    session = _session(path)
    for _ in range(2):
        session.run(None, feeds)
    timings = []
    for _ in range(iterations):
        start = time.perf_counter()
        session.run(None, feeds)
        timings.append((time.perf_counter() - start) * 1000)
    return {"iterations": iterations, "mean_ms": statistics.fmean(timings), "p50_ms": statistics.median(timings), "p95_ms": sorted(timings)[max(0, math.ceil(iterations * .95) - 1)]}


def quantize_dynamic(input_path: str | Path, output_path: str | Path, excluded_ops: Iterable[str] = ()) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic
    quantize_dynamic(str(input_path), str(output_path), weight_type=QuantType.QInt8, per_channel=True, reduce_range=False, nodes_to_exclude=list(excluded_ops), extra_options={"DisableShapeInference": False})


def quantize_static_qdq(input_path: str | Path, output_path: str | Path, calibration_reader: Any, excluded_ops: Iterable[str] = ()) -> None:
    from onnxruntime.quantization import QuantFormat, QuantType, quantize_static
    quantize_static(str(input_path), str(output_path), calibration_reader, quant_format=QuantFormat.QDQ, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, per_channel=True, nodes_to_exclude=list(excluded_ops), extra_options={"ActivationSymmetric": False, "WeightSymmetric": True})


def read_manifest(path: str | Path) -> list[dict[str, Any]]:
    """Read JSONL calibration manifest and reject missing/non-local audio paths."""
    records = []
    for number, line in enumerate(Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        item = json.loads(line)
        audio = Path(item["audio"])
        if not audio.is_absolute():
            audio = Path(path).parent / audio
        if not audio.exists():
            raise FileNotFoundError(f"manifest line {number}: local audio does not exist: {audio}")
        item["audio"] = str(audio.resolve())
        records.append(item)
    if not records:
        raise ValueError("calibration manifest is empty")
    return records


def report_markdown(report: dict[str, Any]) -> str:
    lines = ["# RVC ONNX quantization audit", "", f"Generated: `{report['generated_at']}`", "", "## Reproducibility", "", f"Calibration provenance: **{report['calibration']['provenance']}**.", f"Manifest records: **{report['calibration']['records']}**. No model weights are downloaded or committed.", "", "## Component decisions", "", "| Component | Role | Format/decision | Quality risk | Exclusions |", "|---|---|---|---|---|"]
    for row in report["components"]:
        lines.append(f"| {row['component']} | {row['role']} | `{row['quantization']}` | {row['quality_risk']} | {row['exclusion_reason'] or 'none'} |")
    lines.extend(["", "## Model measurements", "", "| Component | FP32 size | INT8 size | Operator count | MAE | RMSE | Cosine | SNR dB | Mean latency ms |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"])
    for row in report.get("measurements", []):
        lines.append(f"| {row['component']} | {row['fp32_size_bytes']} | {row.get('int8_size_bytes', 'n/a')} | {row['operator_count']} | {row.get('mae', 'n/a')} | {row.get('rmse', 'n/a')} | {row.get('cosine_similarity', 'n/a')} | {row.get('snr_db', 'n/a')} | {row.get('latency_mean_ms', 'n/a')} |")
    lines.extend(["", "## Mobile artifact contract", "", "Mobile receives only validated local ONNX artifacts and optional retrieval index files. It must not run conversion, calibration, shape inference, or model downloading. ContentVec/RMVPE/net_g are separate artifacts; v1/v2 metadata and sample-rate/frame contracts must accompany each voice.", "", "## References", "", "1. [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)", "2. [voiceclonnx pure-ONNX reference](https://github.com/TigreGotico/voiceclonnx)", ""])
    return "\n".join(lines)


def make_report(model_paths: dict[str, str], calibration: dict[str, Any], measurements: list[dict[str, Any]], output_dir: str | Path) -> dict[str, Any]:
    report = {"schema_version": 1, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "calibration": calibration, "components": [asdict(x) for x in POLICIES], "measurements": measurements, "excluded_operators": {x.component: [] for x in POLICIES}, "models": {component: asdict(inspect_model(path)) for component, path in model_paths.items()}}
    output = Path(output_dir); output.mkdir(parents=True, exist_ok=True)
    (output / "audit.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    (output / "audit.md").write_text(report_markdown(report))
    return report


def synthetic_manifest(output_dir: str | Path, count: int = 4) -> Path:
    """Create deterministic local WAV calibration fixtures without external data."""
    import wave
    import numpy as np
    root = Path(output_dir); root.mkdir(parents=True, exist_ok=True)
    manifest = root / "calibration.jsonl"
    rows = []
    rate = 16000
    for i in range(count):
        samples = (0.2 * np.sin(2 * np.pi * (180 + i * 30) * np.arange(rate // 2) / rate) * 32767).astype("<i2")
        wav = root / f"fixture_{i:02d}.wav"
        with wave.open(str(wav), "wb") as stream:
            stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(rate); stream.writeframes(samples.tobytes())
        rows.append({"audio": wav.name, "sample_rate": rate, "purpose": "synthetic_sine_fixture", "seed": i})
    manifest.write_text("\n".join(json.dumps(row, sort_keys=True) for row in rows) + "\n")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    inspect = sub.add_parser("inspect", help="validate and summarize an ONNX model"); inspect.add_argument("model"); inspect.add_argument("--json", action="store_true")
    synth = sub.add_parser("synthetic-fixtures", help="create deterministic local WAVs and a JSONL manifest"); synth.add_argument("output"); synth.add_argument("--count", type=int, default=4)
    manifest = sub.add_parser("validate-manifest", help="validate a local JSONL calibration manifest"); manifest.add_argument("manifest")
    audit = sub.add_parser("audit", help="inspect component models and write audit.json/audit.md")
    audit.add_argument("--model", action="append", required=True, metavar="COMPONENT=PATH")
    audit.add_argument("--manifest", required=True)
    audit.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    if args.command == "inspect":
        print(json.dumps(asdict(inspect_model(args.model)), indent=2))
    elif args.command == "synthetic-fixtures":
        print(synthetic_manifest(args.output, args.count))
    elif args.command == "validate-manifest":
        records = read_manifest(args.manifest); print(json.dumps({"records": len(records), "provenance": "user-supplied-local-manifest", "paths": [x["audio"] for x in records]}, indent=2))
    else:
        records = read_manifest(args.manifest)
        models = {}
        for item in args.model:
            component, separator, path = item.partition("=")
            if not separator or component not in COMPONENTS:
                raise SystemExit(f"--model must be COMPONENT=PATH where COMPONENT is one of {','.join(COMPONENTS)}")
            models[component] = path
        report = make_report(models, {"records": len(records), "provenance": "user-supplied-local-manifest"}, [], args.out)
        print(json.dumps({"out": str(args.out), "models": list(report["models"]), "calibration_records": len(records)}, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
