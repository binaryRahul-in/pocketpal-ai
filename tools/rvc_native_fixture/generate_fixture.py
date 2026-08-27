from pathlib import Path

import onnx
from onnx import TensorProto, helper


OUTPUT = Path(__file__).with_name("rvc_native_fixture.onnx")


def main() -> None:
    phone = helper.make_tensor_value_info("phone", TensorProto.FLOAT, [1, 20, 768])
    phone_lengths = helper.make_tensor_value_info("phone_lengths", TensorProto.INT64, [1])
    pitch = helper.make_tensor_value_info("pitch", TensorProto.INT64, [1, 20])
    pitchf = helper.make_tensor_value_info("pitchf", TensorProto.FLOAT, [1, 20])
    ds = helper.make_tensor_value_info("ds", TensorProto.INT64, [1])
    waveform = helper.make_tensor_value_info("waveform", TensorProto.FLOAT, [1, 20, 768])
    offset = helper.make_tensor("offset", TensorProto.FLOAT, [1], [0.5])
    nodes = [
        helper.make_node("Add", ["phone", "offset"], ["waveform"]),
    ]
    graph = helper.make_graph(
        nodes,
        "pocketpal_rvc_native_fixture",
        [phone, phone_lengths, pitch, pitchf, ds],
        [waveform],
        initializer=[offset],
    )
    model = helper.make_model(
        graph,
        producer_name="pocketpal-ai-rvc-native-fixture",
        opset_imports=[helper.make_opsetid("", 17)],
    )
    onnx.checker.check_model(model)
    OUTPUT.write_bytes(model.SerializeToString())
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
