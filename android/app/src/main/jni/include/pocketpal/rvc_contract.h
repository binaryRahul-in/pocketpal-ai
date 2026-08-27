#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace pocketpal::rvc {

// RVC is any-to-one. The target speaker is embedded in the selected model.
enum class PitchExtractorKind { Harvest, Rmvpe, Crepe, Fcpe };
enum class RvcInputMode { SpeechToSpeech, TtsToRvc };
enum class IndexMode { None, Local, External };
enum class ExecutionProvider { Cpu, CoreMl, Nnapi, Cuda, Vulkan };
enum class Quantization { Fp32, Fp16, Int8 };
enum class ProgressPhase { Loading, Converting, Streaming, Flushing, Complete, Cancelled };

template <typename T>
struct AudioBuffer {
  std::vector<T> pcm;
  std::int32_t sample_rate{};
  std::int32_t channels{};
  std::int64_t timestamp_ms{};
};

struct RvcConfig {
  std::int32_t sample_rate{};
  std::string model_version;
  PitchExtractorKind f0_method{};
  IndexMode index_mode{};
  float index_rate{};
  std::int32_t chunk_duration_ms{};
  ExecutionProvider execution_provider{};
  Quantization quantization{};
  std::optional<std::uint64_t> memory_budget_bytes;
};

struct RvcProfile {
  std::string id;
  std::string name;
  std::string model_id;
  RvcInputMode input_mode{};
  PitchExtractorKind pitch_extractor{};
  RvcConfig config;
};

struct RvcModelManifest {
  std::string id;
  std::string model_version;
  std::string target_speaker;
  std::int32_t sample_rate{};
  std::string model_path;
  std::optional<std::string> index_path;
};

struct ModelHandle {
  std::string id;
  std::string model_version;
  std::string target_speaker;
};

struct RvcProgressEvent {
  ProgressPhase phase{};
  float progress{};
  std::optional<std::int64_t> processed_ms;
  std::optional<std::int64_t> total_ms;
  std::optional<float> realtime_factor;
  std::optional<float> latency_ms;
};

struct RvcLatencyMetrics {
  std::optional<float> load_ms;
  std::optional<float> first_chunk_ms;
  std::optional<float> average_chunk_ms;
  std::optional<float> end_to_end_ms;
  std::optional<float> realtime_factor;
};

struct RvcCapabilities {
  bool available{};
  std::vector<RvcInputMode> input_modes;
  std::vector<PitchExtractorKind> pitch_extractors;
  std::vector<ExecutionProvider> execution_providers;
  std::vector<Quantization> quantizations;
  std::vector<std::int32_t> sample_rates;
  std::optional<std::uint64_t> max_memory_bytes;
  std::optional<RvcLatencyMetrics> latency;
};

struct RvcConversionResult {
  AudioBuffer<float> audio;
  std::optional<RvcLatencyMetrics> metrics;
};

struct RvcError {
  std::string code;
  std::string message;
  bool recoverable{};
};

using ProgressCallback = std::function<void(const RvcProgressEvent&)>;

/** Stable ABI boundary. Implementations are optional and selected at runtime. */
class RvcModule {
 public:
  virtual ~RvcModule() = default;
  virtual std::optional<ModelHandle> loadModel(const RvcModelManifest&, const RvcConfig&, RvcError*) = 0;
  virtual bool unloadModel(const std::string& model_id, RvcError*) = 0;
  virtual std::optional<RvcConversionResult> convertFile(const std::string& model_id, const AudioBuffer<float>&, ProgressCallback, RvcError*) = 0;
  virtual bool startStream(const std::string& model_id, const RvcConfig&, RvcError*) = 0;
  virtual std::optional<AudioBuffer<float>> pushAudioChunk(const AudioBuffer<float>&, RvcError*) = 0;
  virtual std::optional<RvcConversionResult> flush(RvcError*) = 0;
  virtual bool cancel(RvcError*) = 0;
  virtual RvcCapabilities getCapabilities() const = 0;
  virtual void release() = 0;
};

}  // namespace pocketpal::rvc
