#include "onnx_session.h"

#include <algorithm>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <utility>

#if __has_include(<onnxruntime_cxx_api.h>)
#define POCKETPAL_HAS_ORT 1
#include <onnxruntime_cxx_api.h>
#else
#define POCKETPAL_HAS_ORT 0
#endif

#if defined(__ANDROID__)
#include <dlfcn.h>
#endif

namespace pocketpal::onnx {

namespace {

auto ProviderOrder(Provider requested, bool quantized) -> std::vector<Provider> {
  // Mobile guidance: CPU is the reliable baseline for quantized graphs. Float
  // graphs try XNNPACK first, while accelerators remain opt-in benchmarks.
  if (requested == Provider::Cpu) return {Provider::Cpu};
  if (quantized) return {requested, Provider::Cpu};
  return {requested, Provider::Cpu};
}

auto ProviderSupported(Provider provider) -> bool {
  switch (provider) {
  case Provider::Cpu: return true;
  case Provider::Xnnpack:
#if POCKETPAL_HAS_ORT
    return true;
#else
    return false;
#endif
  case Provider::Nnapi:
#if defined(__ANDROID__) && POCKETPAL_HAS_ORT
    return true;
#else
    return false;
#endif
  case Provider::CoreMl:
#if defined(__APPLE__) && POCKETPAL_HAS_ORT
    return true;
#else
    return false;
#endif
  }
  return false;
}

void AddFallback(Diagnostics *d, Provider provider, const char *reason) {
  if (d) d->fallback_reasons.emplace_back(std::string(ProviderName(provider)) + ": " + reason);
}

} // namespace

struct Session::Impl {
  SessionOptions options;
  std::shared_ptr<CancellationToken> cancellation;
  Diagnostics diagnostics;
#if POCKETPAL_HAS_ORT
  Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "pocketpal-onnx-spike"};
  Ort::SessionOptions ort_options;
  std::unique_ptr<Ort::Session> session;
#endif
};

auto ProviderName(Provider provider) -> const char * {
  switch (provider) {
  case Provider::Cpu: return "CPUExecutionProvider";
  case Provider::Xnnpack: return "XNNPACKExecutionProvider";
  case Provider::Nnapi: return "NNAPIExecutionProvider";
  case Provider::CoreMl: return "CoreMLExecutionProvider";
  }
  return "UnknownExecutionProvider";
}

auto ParseProvider(const std::string &name) -> Provider {
  if (name == "XNNPACK" || name == "XNNPACKExecutionProvider") return Provider::Xnnpack;
  if (name == "NNAPI" || name == "NNAPIExecutionProvider") return Provider::Nnapi;
  if (name == "CoreML" || name == "CoreMLExecutionProvider") return Provider::CoreMl;
  return Provider::Cpu;
}

auto IsProviderCompiled(Provider provider) -> bool { return ProviderSupported(provider); }

auto Session::Create(const SessionOptions &options,
                     std::shared_ptr<CancellationToken> cancellation,
                     Diagnostics *diagnostics) -> std::unique_ptr<Session> {
  auto impl = std::make_unique<Impl>();
  impl->options = options;
  impl->cancellation = std::move(cancellation);
  impl->diagnostics.requested_provider = options.requested_provider;
  impl->diagnostics.available_providers = {Provider::Cpu};
  for (const auto provider : {Provider::Xnnpack, Provider::Nnapi, Provider::CoreMl}) {
    if (ProviderSupported(provider)) impl->diagnostics.available_providers.push_back(provider);
  }
  if (impl->cancellation && impl->cancellation->IsCancelled()) {
    impl->diagnostics.cancelled = true;
    AddFallback(&impl->diagnostics, options.requested_provider, "cancelled before session creation");
    if (diagnostics) *diagnostics = impl->diagnostics;
    return nullptr;
  }

  auto order = ProviderOrder(options.requested_provider, options.quantized);
#if POCKETPAL_HAS_ORT
  std::string last_error;
  for (const auto provider : order) {
    if (!ProviderSupported(provider)) {
      AddFallback(&impl->diagnostics, provider, "not compiled for this platform");
      continue;
    }
    try {
      impl->ort_options.SetIntraOpNumThreads(std::max(1, options.intra_op_threads));
      impl->ort_options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
      // Provider append calls are intentionally guarded by compile/platform
      // flags in the package build. CPU remains the final, unconditional path.
#if defined(__ANDROID__)
      if (provider == Provider::Nnapi) impl->ort_options.AppendExecutionProvider_Nnapi({});
#endif
#if defined(__APPLE__)
      if (provider == Provider::CoreMl) impl->ort_options.AppendExecutionProvider_CoreML({});
#endif
      if (provider == Provider::Xnnpack) impl->ort_options.AppendExecutionProvider("XNNPACK", {});
      impl->session = std::make_unique<Ort::Session>(impl->env, options.model_path.c_str(), impl->ort_options);
      impl->diagnostics.selected_provider = provider;
      impl->diagnostics.initialized = true;
      break;
    } catch (const Ort::Exception &error) {
      last_error = error.what();
      AddFallback(&impl->diagnostics, provider, last_error.c_str());
    }
  }
  if (!impl->diagnostics.initialized) {
    try {
      impl->ort_options = Ort::SessionOptions{};
      impl->session = std::make_unique<Ort::Session>(impl->env, options.model_path.c_str(), impl->ort_options);
      impl->diagnostics.selected_provider = Provider::Cpu;
      impl->diagnostics.initialized = true;
    } catch (const Ort::Exception &error) {
      impl->diagnostics.error = error.what();
    }
  }
#else
  // Keeps the host fixture/unit-test target buildable without shipping ORT
  // headers. Mobile builds receive the real package headers through CMake/Pods.
  std::ifstream fixture(options.model_path, std::ios::binary);
  if (!fixture.good()) impl->diagnostics.error = "model fixture is not readable";
  else {
    impl->diagnostics.selected_provider = Provider::Cpu;
    impl->diagnostics.initialized = true;
    if (options.requested_provider != Provider::Cpu)
      AddFallback(&impl->diagnostics, options.requested_provider, "ORT headers unavailable in host spike target");
  }
#endif
  if (diagnostics) *diagnostics = impl->diagnostics;
  if (!impl->diagnostics.initialized) return nullptr;
  return std::unique_ptr<Session>(new Session(std::move(impl)));
}

Session::Session(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
Session::~Session() = default;

void Session::Cancel() noexcept {
  if (impl_ && impl_->cancellation) {
    impl_->cancellation->Cancel();
    impl_->diagnostics.cancelled = true;
  }
}

auto Session::Run(const std::vector<Tensor> &inputs, std::vector<Tensor> *outputs,
                  Diagnostics *diagnostics) -> bool {
  if (!impl_ || !impl_->diagnostics.initialized || !outputs) return false;
  if (impl_->cancellation && impl_->cancellation->IsCancelled()) {
    impl_->diagnostics.cancelled = true;
    if (diagnostics) *diagnostics = impl_->diagnostics;
    return false;
  }
#if POCKETPAL_HAS_ORT
  try {
    Ort::AllocatorWithDefaultOptions allocator;
    std::vector<const char *> names;
    std::vector<Ort::Value> values;
    for (const auto &input : inputs) {
      names.push_back(input.name.c_str());
      auto info = Ort::MemoryInfo("Cpu", OrtAllocatorType::OrtArenaAllocator, 0, OrtMemTypeDefault);
      auto type = input.type == ElementType::Float32 ? ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT :
                  input.type == ElementType::Int64 ? ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64 : ONNX_TENSOR_ELEMENT_DATA_TYPE_UINT8;
      values.emplace_back(Ort::Value::CreateTensor(info, const_cast<uint8_t *>(input.bytes.data()), input.bytes.size(), input.shape.data(), input.shape.size(), type));
    }
    size_t output_count = impl_->session->GetOutputCount();
    std::vector<std::string> output_name_storage;
    std::vector<const char *> output_names;
    output_name_storage.reserve(output_count);
    output_names.reserve(output_count);
    for (size_t i = 0; i < output_count; ++i) {
      auto allocated_name = impl_->session->GetOutputNameAllocated(i, allocator);
      output_name_storage.emplace_back(allocated_name.get());
      output_names.push_back(output_name_storage.back().c_str());
    }
    auto result = impl_->session->Run(Ort::RunOptions{nullptr}, names.data(), values.data(), values.size(), output_names.data(), output_names.size());
    outputs->clear();
    for (size_t i = 0; i < result.size(); ++i) {
      auto shape = result[i].GetTensorTypeAndShapeInfo().GetShape();
      auto bytes = result[i].GetTensorTypeAndShapeInfo().GetElementCount() * sizeof(float);
      const auto *data = result[i].GetTensorData<float>();
      Tensor output;
      output.name = output_names[i]; output.shape = std::move(shape); output.bytes.resize(bytes);
      std::memcpy(output.bytes.data(), data, bytes); outputs->push_back(std::move(output));
    }
  } catch (const Ort::Exception &error) {
    impl_->diagnostics.error = error.what();
    if (diagnostics) *diagnostics = impl_->diagnostics;
    return false;
  }
#else
  // Host fallback fixture is an identity graph stand-in for lifecycle tests.
  *outputs = inputs;
#endif
  if (diagnostics) *diagnostics = impl_->diagnostics;
  return true;
}

auto Session::GetDiagnostics() const -> Diagnostics { return impl_ ? impl_->diagnostics : Diagnostics{}; }

} // namespace pocketpal::onnx
