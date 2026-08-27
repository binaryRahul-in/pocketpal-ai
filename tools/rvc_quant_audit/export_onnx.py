#!/usr/bin/env python3
"""Export deterministic toy ONNX component graphs for offline harness tests.

This is a smoke fixture generator, not an RVC weight exporter. Real ContentVec,
RMVPE, net_g, and retrieval assets must be supplied locally by the model owner.
"""
from __future__ import annotations

import argparse
from pathlib import Path


def export_component(output: str | Path, component: str, opset: int = 17) -> Path:
    try:
        import onnx
        from onnx import TensorProto, helper
    except ImportError as exc:
        raise RuntimeError("ONNX fixture export requires: pip install -r tools/rvc_quant_audit/requirements.txt") from exc
    path = Path(output); path.parent.mkdir(parents=True, exist_ok=True)
    input_info = helper.make_tensor_value_info("audio_or_features", TensorProto.FLOAT, [1, 16])
    output_info = helper.make_tensor_value_info("features_or_audio", TensorProto.FLOAT, [1, 16])
    scale = helper.make_tensor("scale", TensorProto.FLOAT, [], [1.0])
    node = helper.make_node("Mul", ["audio_or_features", "scale"], ["features_or_audio"], name=f"{component}_identity_scale")
    graph = helper.make_graph([node], f"synthetic_{component}", [input_info], [output_info], [scale])
    model = helper.make_model(graph, producer_name="pocketpal-rvc-audit", opset_imports=[helper.make_opsetid("", opset)])
    onnx.checker.check_model(model)
    onnx.save(model, str(path))
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output")
    parser.add_argument("--component", default="content_encoder")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()
    print(export_component(args.output, args.component, args.opset))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
