#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace pocketpal::onnx {

enum class Provider { Cpu, Xnnpack, Nnapi, CoreMl };
enum class ElementType { Float32, Int64, UInt8 };

auto ProviderName(Provider provider) -> const char *;
auto ParseProvider(const std::string &name) -> Provider;

auto IsProviderCompiled(Provider provider) -> bool;

struct Tensor {
  std::string name;
  ElementType type = ElementType::Float32;
  std::vector<int64_t> shape;
  std::vector<uint8_t> bytes;
};

struct SessionOptions {
  std::string model_path;
  Provider requested_provider = Provider::Cpu;
  bool quantized = false;
  int intra_op_threads = 1;
};

struct Diagnostics {
  Provider requested_provider = Provider::Cpu;
  Provider selected_provider = Provider::Cpu;
  std::vector<Provider> available_providers;
  std::vector<std::string> fallback_reasons;
  bool initialized = false;
  bool cancelled = false;
  std::string error;
};

class CancellationToken {
public:
  void Cancel() noexcept { cancelled_.store(true, std::memory_order_relaxed); }
  auto IsCancelled() const noexcept -> bool {
    return cancelled_.load(std::memory_order_relaxed);
  }

private:
  std::atomic<bool> cancelled_{false};
};

class Session {
public:
  static auto Create(const SessionOptions &options,
                     std::shared_ptr<CancellationToken> cancellation,
                     Diagnostics *diagnostics) -> std::unique_ptr<Session>;
  ~Session();

  Session(const Session &) = delete;
  auto operator=(const Session &) -> Session & = delete;

  auto Run(const std::vector<Tensor> &inputs, std::vector<Tensor> *outputs,
           Diagnostics *diagnostics) -> bool;
  void Cancel() noexcept;
  auto GetDiagnostics() const -> Diagnostics;

private:
  struct Impl;
  explicit Session(std::unique_ptr<Impl> impl);
  std::unique_ptr<Impl> impl_;
};

} // namespace pocketpal::onnx
