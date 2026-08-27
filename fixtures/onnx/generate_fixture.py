from pathlib import Path

import onnx
from onnx import TensorProto, helper

x = helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 4])
y = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 4])
node = helper.make_node('Identity', ['input'], ['output'])
graph = helper.make_graph([node], 'pocketpal_identity_fixture', [x], [y])
model = helper.make_model(graph, producer_name='pocketpal-onnx-spike', opset_imports=[helper.make_opsetid('', 13)])
model.ir_version = 8
Path(__file__).with_name('identity_float.onnx').write_bytes(model.SerializeToString())
