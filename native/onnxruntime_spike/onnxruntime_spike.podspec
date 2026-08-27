Pod::Spec.new do |spec|
  spec.name = 'pocketpal-onnxruntime-spike'
  spec.version = '0.1.0'
  spec.summary = 'Isolated ONNX Runtime native session spike'
  spec.platforms = {ios: '15.1'}
  spec.source = {path: '.'}
  spec.source_files = 'include/*.h', 'src/*.cpp'
  spec.public_header_files = 'include/*.h'
  spec.dependency 'onnxruntime-c'
  spec.dependency 'React-Core'
  spec.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'OTHER_CPLUSPLUSFLAGS' => '-Wall -Wextra'
  }
end
