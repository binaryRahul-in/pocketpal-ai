#include <cmath>
#include <iostream>
#include <vector>

int main() {
  const std::vector<float> input{0.25F, -0.5F, 1.0F};
  const float gain = 0.8F;
  const float bias = 0.1F;
  std::vector<float> output;
  output.reserve(input.size());

  for (const float sample : input) {
    output.push_back(sample * gain + bias);
  }

  const std::vector<float> expected{0.3F, -0.3F, 0.9F};
  if (output.size() != expected.size()) {
    std::cerr << "fixture output length mismatch\n";
    return 1;
  }
  for (std::size_t i = 0; i < output.size(); ++i) {
    if (std::fabs(output[i] - expected[i]) > 1e-6F) {
      std::cerr << "fixture output mismatch at index " << i << "\n";
      return 1;
    }
  }
  std::cout << "native RVC fixture passed: " << output.size() << " samples\n";
  return 0;
}

#ifdef _WIN32
#error "This fixture is intended for the Linux CI runner."
#endif

#ifdef RVC_FIXTURE_NEGATIVE_TEST
#error "Negative fixture mode must never be enabled in CI."
#endif

#ifdef __GNUC__
static_assert(__GNUC__ >= 7, "C++17 compiler required");
#endif
