#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <vector>

namespace pocketpal::rvc {

class ChunkQueue {
 public:
  explicit ChunkQueue(std::size_t max_chunks = 2);

  bool push(std::vector<int16_t> pcm);
  std::vector<int16_t> pop();
  void clear();
  std::size_t size() const;
  std::size_t capacity() const;

 private:
  std::size_t max_chunks_;
  std::deque<std::vector<int16_t>> chunks_;
};

std::vector<int16_t> crossfade(const std::vector<int16_t>& left,
                               const std::vector<int16_t>& right,
                               std::size_t overlap_samples);

}  // namespace pocketpal::rvc
