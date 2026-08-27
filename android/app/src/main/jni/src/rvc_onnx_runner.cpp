#include "rvc_onnx_runner.h"

#include <onnxruntime_cxx_api.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef __ANDROID__
#include <android/log.h>
#endif

namespace pocketpal::rvc {
namespace {

std::string json_escape(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char character : value) {
    if (character == '\\' || character == '"') {
      escaped.push_back('\\');
    }
    escaped.push_back(character);
  }
  return escaped;
}

std::string tensor_type_name(ONNXTensorElementDataType type) {
  switch (type) {
    case ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT:
      return "float32";
    case ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64:
      return "int64";
    default:
      return "unsupported";
  }
}

std::vector<int64_t> concrete_shape(const std::vector<int64_t>& shape, const std::string& name) {
  std::vector<int64_t> result = shape;
  const bool frame_input = name == "phone" || name == "pitch" || name == "pitchf";
  for (auto& dimension : result) {
    if (dimension <= 0) {
      dimension = frame_input ? 20 : 1;
    }
  }
  return result;
}

size_t element_count(const std::vector<int64_t>& shape) {
  size_t count = 1;
  for (const int64_t dimension : shape) {
    if (dimension <= 0 ||
        count > std::numeric_limits<size_t>::max() / static_cast<size_t>(dimension)) {
      throw std::runtime_error("invalid or oversized tensor shape");
    }
    count *= static_cast<size_t>(dimension);
  }
  return count;
}

std::string shape_json(const std::vector<int64_t>& shape) {
  std::ostringstream stream;
  stream << "[";
  for (size_t index = 0; index < shape.size(); ++index) {
    if (index != 0) {
      stream << ",";
    }
    stream << shape[index];
  }
  stream << "]";
  return stream.str();
}

std::vector<int64_t> make_int64_input(const std::string& name, size_t count, int64_t frames) {
  std::vector<int64_t> values(count, 0);
  if (name == "phone_lengths" && !values.empty()) {
    values[0] = frames;
  }
  return values;
}

std::vector<float> make_float_input(const std::string& name, size_t count) {
  std::vector<float> values(count, 0.0f);
  if (name == "pitchf") {
    std::fill(values.begin(), values.end(), 220.0f);
  }
  return values;
}

}  // namespace

RunSummary run_model_summary(const std::string& model_path) {
  if (model_path.empty()) {
    throw std::runtime_error("model path is empty");
  }

  Ort::Env env(ORT_LOGGING_LEVEL_WARNING, "pocketpal-rvc-native");
  Ort::SessionOptions session_options;
  session_options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_BASIC);
  session_options.SetIntraOpNumThreads(1);
  session_options.SetInterOpNumThreads(1);
  Ort::Session session(env, model_path.c_str(), session_options);
  Ort::AllocatorWithDefaultOptions allocator;

  const size_t input_count = session.GetInputCount();
  if (input_count == 0) {
    throw std::runtime_error("ONNX graph has no inputs");
  }

  constexpr int64_t kDefaultFrames = 20;
  std::vector<std::string> input_names_storage;
  std::vector<const char*> input_names;
  std::vector<Ort::Value> input_values;
  std::vector<std::vector<float>> float_backings;
  std::vector<std::vector<int64_t>> int64_backings;
  input_names_storage.reserve(input_count);
  input_names.reserve(input_count);
  input_values.reserve(input_count);
  float_backings.reserve(input_count);
  int64_backings.reserve(input_count);

  for (size_t index = 0; index < input_count; ++index) {
    auto name = session.GetInputNameAllocated(index, allocator);
    if (!name || std::strlen(name.get()) == 0) {
      throw std::runtime_error("ONNX graph has an unnamed input");
    }
    input_names_storage.emplace_back(name.get());
    const std::string& input_name = input_names_storage.back();
    const auto input_type_info = session.GetInputTypeInfo(index);
    const auto type_info = input_type_info.GetTensorTypeAndShapeInfo();
    const auto type = type_info.GetElementType();
    const auto shape = concrete_shape(type_info.GetShape(), input_name);
    const size_t count = element_count(shape);

    if (type == ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) {
      float_backings.push_back(make_float_input(input_name, count));
      input_values.emplace_back(Ort::Value::CreateTensor<float>(
          Ort::MemoryInfo("Cpu", OrtAllocatorType::OrtArenaAllocator, 0, OrtMemTypeDefault),
          float_backings.back().data(), float_backings.back().size(), shape.data(), shape.size()));
    } else if (type == ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64) {
      int64_backings.push_back(make_int64_input(input_name, count, kDefaultFrames));
      input_values.emplace_back(Ort::Value::CreateTensor<int64_t>(
          Ort::MemoryInfo("Cpu", OrtAllocatorType::OrtArenaAllocator, 0, OrtMemTypeDefault),
          int64_backings.back().data(), int64_backings.back().size(), shape.data(), shape.size()));
    } else {
      throw std::runtime_error("unsupported ONNX input dtype for native smoke: " + input_name + " type=" + std::to_string(static_cast<int>(type)));
    }
    input_names.push_back(input_names_storage.back().c_str());
  }

  std::vector<const char*> output_names;
  const size_t output_count = session.GetOutputCount();
  if (output_count == 0) {
    throw std::runtime_error("ONNX graph has no outputs");
  }
  auto output_name = session.GetOutputNameAllocated(0, allocator);
  output_names.push_back(output_name.get());
  auto outputs = session.Run(Ort::RunOptions{nullptr}, input_names.data(), input_values.data(),
                             input_values.size(), output_names.data(), 1);
  if (outputs.empty() || !outputs[0].IsTensor()) {
    throw std::runtime_error("ONNX graph returned no tensor output");
  }

  auto output_info = outputs[0].GetTensorTypeAndShapeInfo();
  const auto output_type = output_info.GetElementType();
  const auto output_shape = output_info.GetShape();
  const size_t output_elements = output_info.GetElementCount();
  if (output_elements == 0) {
    throw std::runtime_error("ONNX graph returned an empty tensor");
  }
  if (output_type != ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) {
    throw std::runtime_error("ONNX graph output must be float32");
  }

  const float* output_data = outputs[0].GetTensorData<float>();
  bool finite = true;
  bool nonzero = false;
  double sum = 0.0;
  uint64_t checksum = 1469598103934665603ULL;
  for (size_t index = 0; index < output_elements; ++index) {
    const float value = output_data[index];
    finite = finite && std::isfinite(value);
    nonzero = nonzero || std::abs(value) > 1e-8f;
    sum += static_cast<double>(value);
    uint32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    checksum ^= bits;
    checksum *= 1099511628211ULL;
  }
  if (!finite) {
    throw std::runtime_error("ONNX graph returned non-finite output values");
  }

  std::ostringstream result;
  result << "{\"valid\":true,\"outputDtype\":\""
         << tensor_type_name(output_type) << "\",\"outputShape\":"
         << shape_json(output_shape) << ",\"outputElements\":" << output_elements
         << ",\"finite\":" << (finite ? "true" : "false") << ",\"nonzero\":"
         << (nonzero ? "true" : "false") << ",\"sum\":" << sum
         << ",\"checksumFNV1a\":\"" << checksum << "\"}";
  return RunSummary{result.str()};
}

}  // namespace pocketpal::rvc

#ifdef __ANDROID__
extern "C" JNIEXPORT jstring JNICALL
Java_com_pocketpal_RvcRuntimeModule_nativeRunModelSmoke(
    JNIEnv* env, jobject /*thiz*/, jstring model_path) {
  try {
    if (model_path == nullptr) {
      throw std::runtime_error("model path is null");
    }
    const char* chars = env->GetStringUTFChars(model_path, nullptr);
    if (chars == nullptr) {
      throw std::runtime_error("could not read model path");
    }
    const std::string path(chars);
    env->ReleaseStringUTFChars(model_path, chars);
    return env->NewStringUTF(pocketpal::rvc::run_model_summary(path).json.c_str());
  } catch (const std::exception& error) {
    const std::string result = std::string("{\"valid\":false,\"error\":\"") +
                               pocketpal::rvc::json_escape(error.what()) + "\"}";
    return env->NewStringUTF(result.c_str());
  }
}
#endif
