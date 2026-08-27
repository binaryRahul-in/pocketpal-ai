#include "onnx_session.h"
#include <cassert>
#include <iostream>
#include <memory>
#include <vector>
using namespace pocketpal::onnx;
int main(int argc, char **argv) {
  assert(argc == 2);
  auto token = std::make_shared<CancellationToken>();
  SessionOptions options{argv[1], Provider::Nnapi, false, 1};
  Diagnostics diagnostics;
  auto session = Session::Create(options, token, &diagnostics);
  assert(session);
  assert(diagnostics.initialized);
  assert(diagnostics.selected_provider == Provider::Cpu || diagnostics.selected_provider == Provider::Nnapi);
  Tensor input{"input", ElementType::Float32, {1, 4}, std::vector<uint8_t>(16)};
  std::vector<Tensor> outputs;
  assert(session->Run({input}, &outputs, &diagnostics));
  assert(outputs.size() == 1);
  session->Cancel();
  assert(!session->Run({input}, &outputs, &diagnostics));
  auto cancelled = std::make_shared<CancellationToken>();
  cancelled->Cancel();
  assert(!Session::Create(options, cancelled, &diagnostics));
  std::cout << "selected=" << ProviderName(diagnostics.selected_provider) << " fallback_count=" << diagnostics.fallback_reasons.size() << "\n";
}
