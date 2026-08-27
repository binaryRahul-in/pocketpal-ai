#include "../../android/app/src/main/jni/src/rvc_onnx_runner.h"

#include <iostream>
#include <string>

int main(int argc, char** argv) {
  if (argc != 2) {
    std::cerr << "usage: rvc_native_smoke <fixture.onnx>\n";
    return 2;
  }
  try {
    const auto summary = pocketpal::rvc::run_model_summary(argv[1]);
    if (summary.json.find("\"valid\":true") == std::string::npos ||
        summary.json.find("\"finite\":true") == std::string::npos ||
        summary.json.find("\"nonzero\":true") == std::string::npos) {
      std::cerr << "invalid native ONNX summary: " << summary.json << "\n";
      return 1;
    }
    std::cout << summary.json << "\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "native ONNX smoke failed: " << error.what() << "\n";
    return 1;
  }
}
