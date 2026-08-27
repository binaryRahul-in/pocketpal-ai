# ONNX Runtime native session spike

This directory is an isolated native prototype for the existing `onnxruntime-react-native` 1.24.x compatibility baseline. It is deliberately separate from the RVC engine. The portable C++ layer owns the ONNX Runtime environment, session, allocator-backed tensor values, and cancellation token through RAII.

The session attempts the requested provider, records every unavailable/provider-initialization failure, and always retries with CPU. The platform build should provide ONNX Runtime headers and libraries from the existing React Native package: Android through the package AAR CMake variables and iOS through the `onnxruntime-c` pod. XNNPACK, NNAPI, and CoreML are therefore optional; CPU is unconditional.

## Selection policy

Callers should select CPU for quantized graphs and XNNPACK for float graphs initially. NNAPI and CoreML are opt-in benchmark candidates, not assumed wins. `Diagnostics` returns `requested_provider`, `selected_provider`, `available_providers`, `fallback_reasons`, cancellation state, and initialization errors.

## Lifecycle contract

`Session::Create` owns the environment and session. `Run` marshals named tensors into ORT values and copies output data before temporary allocator objects leave scope. Destruction releases the session, environment, and allocator-owned names on success, error, cancellation, and React Native reload. A cancellation token is shared by the bridge and native session, so cancellation before creation or during a run is observable without leaking the session.

The host fixture target intentionally builds without ORT headers and uses an identity stand-in only for lifecycle tests. Android and iOS debug targets receive the real ORT headers and execute the same fixture graph through the real session implementation.
