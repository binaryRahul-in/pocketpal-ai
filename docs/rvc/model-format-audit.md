# RVC model format and conversion boundary audit

The mobile runtime accepts **validated ONNX voice artifacts only**. Checkpoint inspection, conversion, quantization, hashing, and parity testing remain trusted offline operations.

## Compatibility matrix

| Variant | Feature input | Net_G/VITS width | Rate | Pitch input | FAISS index | Device result |
| --- | --- | ---: | ---: | --- | --- | --- |
| v1 / 40 kHz | ContentVec or HuBERT-compatible | 256 | 40,000 Hz | RMVPE or FCPE matching export | Optional, declared | Accepted after preflight |
| v1 / 48 kHz | ContentVec or HuBERT-compatible | 256 | 48,000 Hz | RMVPE or FCPE matching export | Optional, declared | Accepted after preflight |
| v2 / 40 kHz | ContentVec or HuBERT-compatible | 768 | 40,000 Hz | RMVPE or FCPE matching export | Optional, declared | Accepted after preflight |
| v2 / 48 kHz | ContentVec or HuBERT-compatible | 768 | 48,000 Hz | RMVPE or FCPE matching export | Optional, declared | Accepted after preflight |
| Wrong rate, width, rank, or static dimension | Any | Mismatch | Mismatch | Any | Any | **Rejected before inference** |
| `.pth`, `.pt`, `.ckpt`, pickle, arbitrary `.bin` | PyTorch checkpoint | Unknown | Unknown | Unknown | Unknown | **Rejected; convert offline** |
| ONNX without SHA-256, license, source URL, or tensor metadata | Unknown | Unknown | Unknown | Unknown | Unknown | **Rejected** |

The upstream WebUI uses `.pth` voice weights, optional `.index` files, ContentVec/HuBERT features, and RMVPE assets. CircuitCM confirms production v1/v2 and optional index pairing. voiceclonnx documents an ONNX-only runtime and an offline `export -> parity -> quantize -> provenance` workflow [1] [2] [3].

## Manifest and runtime boundary

`src/services/voiceConversion/rvcManifest.ts` defines `rvc-on-device/1`. It requires SHA-256, license, source URL, `net_g_vits`, v1/v2, 40/48 kHz, feature extractor and width, RMVPE/FCPE, FP32/INT8 state, index presence, and named tensor shapes. `loadValidatedRvcManifest` runs before inference and reports explicit mismatch codes. It has no PyTorch or pickle dependency.

A trusted offline converter may inspect `.pth`, instantiate the matching Net_G/VITS architecture, export shared ContentVec/HuBERT and RMVPE/FCPE components and the per-voice synthesizer to ONNX, optionally quantize, hash, write the manifest, and compare identical inputs through a parity harness. The app receives only the ONNX artifact and manifest.

The metadata-only fixture `src/services/voiceConversion/__tests__/fixtures/rvc-v2-48k-known-good.json` records a known-good voiceclonnx RVC v2/48 kHz export with passing parity (`maxAbsError=7.2e-4`, `meanAbsError=8.1e-5`, tolerances `1e-3` and `1e-4`). Voice weights are not bundled.

## References

[1] [RVC upstream](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI).

[2] [CircuitCM/RVC-inference](https://github.com/CircuitCM/RVC-inference).

[3] [voiceclonnx conversion guide](https://github.com/TigreGotico/voiceclonnx/blob/dev/docs/converting.md).

> **Boundary:** checkpoint to ONNX is offline; manifest validation to ONNX Runtime inference is on device.

## Verification

```sh
yarn typecheck
yarn test src/services/voiceConversion/__tests__/rvcManifest.test.ts --runInBand
```

The configured remote has no `main` ref; this branch is based on the repository’s actual default `pocketpal-lite` ref.
