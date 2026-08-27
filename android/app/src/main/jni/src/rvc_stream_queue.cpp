#include "rvc_stream_queue.h"

#include <algorithm>
#include <cmath>

namespace pocketpal::rvc {

ChunkQueue::ChunkQueue(std::size_t max_chunks)
    : max_chunks_(std::max<std::size_t>(1, max_chunks)) {}

bool ChunkQueue::push(std::vector<int16_t> pcm) {
  if (chunks_.size() >= max_chunks_) return false;
  chunks_.push_back(std::move(pcm));
  return true;
}

std::vector<int16_t> ChunkQueue::pop() {
  if (chunks_.empty()) return {};
  auto chunk = std::move(chunks_.front());
  chunks_.pop_front();
  return chunk;
}

void ChunkQueue::clear() { chunks_.clear(); }

std::size_t ChunkQueue::size() const { return chunks_.size(); }

std::size_t ChunkQueue::capacity() const { return max_chunks_; }

std::vector<int16_t> crossfade(const std::vector<int16_t>& left,
                               const std::vector<int16_t>& right,
                               std::size_t overlap_samples) {
  const auto overlap = std::min({overlap_samples, left.size(), right.size()});
  std::vector<int16_t> output;
  output.reserve(left.size() + right.size() - overlap);
  output.insert(output.end(), left.begin(), left.end() - static_cast<std::ptrdiff_t>(overlap));
  for (std::size_t index = 0; index < overlap; ++index) {
    const float left_weight = static_cast<float>(overlap - index) / static_cast<float>(overlap);
    const float right_weight = static_cast<float>(index) / static_cast<float>(overlap);
    const float sample = static_cast<float>(left[left.size() - overlap + index]) * left_weight
        + static_cast<float>(right[index]) * right_weight;
    output.push_back(static_cast<int16_t>(std::lround(std::clamp(sample, -32768.0f, 32767.0f))));
  }
  output.insert(output.end(), right.begin() + static_cast<std::ptrdiff_t>(overlap), right.end());
  return output;
}

}  // namespace pocketpal::rvc
