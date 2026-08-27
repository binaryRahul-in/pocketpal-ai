# Optional RVC UX Specification

**Status:** Spike specification; no production screens or runtime behavior are changed by this branch.

**Audience:** Product, design, localization, and implementation teams.

**Scope:** Optional retrieval-based voice conversion (RVC) models, including installation, configuration, source-audio handoff, conversion, preview, cancellation, recovery, deletion, and settings reset. The specification is grounded in the existing model-management, hardware-recommendation, memory-warning, error-sheet, snackbar, and localization patterns in `App.tsx`, `ModelsScreen`, `HardwareScreen`, `SettingsScreen`, `ModelSettingsSheet`, `DownloadErrorDialog`, `ErrorSnackbar`, `MemoryRequirement`, `src/services/modelRecommendations`, and `src/locales`.

## Product contract

RVC is an **opt-in, on-device voice-conversion capability**. It is not enabled on first launch, does not replace the normal text-generation or text-to-speech flow, and must never imply that conversion will be real time. The product must distinguish the two supported source types:

| Source | Meaning | User-facing explanation |
| --- | --- | --- |
| Speech-to-speech | A user-selected or recorded speech clip is transformed into the selected voice. | “Your speech content and timing are retained as the conversion source.” |
| TTS source audio | Text is first synthesized into audio, then the resulting audio is converted. | “Text is synthesized first; the generated audio is then converted.” |

The default experience should favor **safe, reversible, and conservative choices**: RVC remains disabled until explicitly enabled; the recommended model is the smallest compatible quantized model; index retrieval is off until selected; the smallest supported chunk size is selected; the default provider is the device’s recommended provider; and output is previewed before any save or share action.

> No screen in this spike should be modified. The flows, copy, key names, and test scenarios below are the implementation contract for a later UI change.

## Entry points and first-run opt-in

RVC is discoverable from the existing model-management surface and from voice/TTS handoff, but it is not part of the default model-installation path. The first entry opens an explainer sheet with the title “Optional voice conversion” and three concise points: conversion may be slow, it can increase memory/storage/thermal use, and the user must have permission to use the source and target voice. The primary action is **Enable voice conversion**; the secondary action is **Not now**. “Not now” closes the sheet without changing settings. Enabling records only the local feature preference and opens the model-selection step; it does not download a model or audio.

If the device is clearly below the minimum capability envelope, the entry point remains visible but the sheet presents a blocking compatibility explanation and an actionable fallback: continue using standard TTS or speech playback without conversion. A device with unknown hardware must not be treated as compatible; it receives a non-blocking “compatibility unknown” warning and a conservative trial path.

The feature-level settings reset must restore the feature to disabled, clear the selected RVC model and conversion settings, remove unfinished installation metadata, and leave unrelated LLM/TTS settings untouched. Deleting an installed model must not silently disable the feature if another compatible model is available; otherwise the next conversion attempt returns to model selection.

## Model installation and lifecycle

The model list should reuse the existing model-card and hardware-recommendation information architecture. Each RVC model exposes name, publisher/source, file size, estimated peak RAM, supported ABI/provider, quantization, index availability, license/consent note, and state. The state machine is explicit so interrupted work can recover deterministically.

| State | Visible status | Allowed actions | Recovery behavior |
| --- | --- | --- | --- |
| Not installed | “Not installed” | Install, view details | Start a new installation transaction. |
| Awaiting confirmation | “Ready to install” | Install, cancel | Return to model details without side effects. |
| Downloading | Progress, bytes, ETA when known | Pause if supported, cancel, background | Preserve resumable partial data only when checksum/manifest is valid. |
| Verifying | “Checking model” | Cancel only if the implementation supports safe cleanup | Delete invalid partial artifact and offer retry. |
| Installed | “Installed” | Configure, preview, convert, delete | Keep model usable until explicit deletion. |
| Failed | “Installation failed” plus reason | Retry, choose another model, delete partial files | Never mark the model installed; retain actionable diagnostics locally. |
| Cancelled | “Installation cancelled” | Resume/retry, delete partial files | Reconcile disk state on next screen entry. |
| Deleting | “Removing model” | No competing model action | Disable conversion for that model until completion. |

The install confirmation must show the **download size, expected on-device footprint, estimated peak RAM, and compatibility confidence**. It must warn when free storage is less than download size plus temporary extraction space plus a safety margin. The primary action is disabled when the model cannot fit; the fallback is “Choose a smaller model”. Installation must use a temporary path, verify integrity, then atomically promote the model. A failed or cancelled install must not leave an artifact that can be loaded as complete.

Cancellation is always user initiated and must be safe: confirm only when work has progressed or partial data exists; say what will remain and what will be removed. A cancellation during verification or atomic promotion either completes the current atomic operation or reports that cleanup is in progress. On app restart, the model registry reconciles temporary files and resumes only verified downloads.

Deletion requires a destructive confirmation sheet naming the model and total reclaimable storage. It must explain that conversion output files are not necessarily deleted unless the user selects the separate output-cleanup option. The safe default is **Keep conversion outputs**. The destructive action is **Delete model**; a second action, **Delete model and outputs**, is visually distinct and requires an additional confirmation when outputs exist.

## Configuration flow

Configuration opens from an installed model and is a sheet or focused route consistent with the existing `ModelSettingsSheet`. The first screen displays a “Recommended” preset and a short summary of expected trade-offs. Changing a setting marks the configuration as dirty; leaving the sheet offers **Save changes**, **Discard changes**, and **Cancel**. Saved settings apply to the next conversion and must not imply that an already-running conversion changes mid-job.

| Option | Safe default | Required behavior and warning |
| --- | --- | --- |
| Source type | Speech-to-speech when launched from a speech clip; TTS source audio when launched from TTS | Always show the source type in the conversion summary. Never describe TTS audio as the user’s recorded speech. |
| Pitch extractor | Device-recommended extractor, otherwise the fastest supported CPU extractor | Explain that extractor choice affects quality, speed, and compatibility. Unsupported extractors are disabled with a reason. |
| Index retrieval | Off | If enabled, explain that it can improve similarity for some voices but may add storage, latency, and artifacts. Fallback: turn it off. |
| Index rate | 0 when index is off; conservative mid-low value when on | Validate range and describe that a higher rate may increase voice similarity and artifacts. |
| Chunk size | Smallest conservative supported value | Larger chunks may improve throughput but increase peak RAM, latency before preview, and crash risk. Fallback: use recommended/smaller chunks. |
| Provider | Recommended compatible provider | Label fallback to CPU clearly. Do not promise acceleration or real-time output. |
| Precision | Quantized model/preset | FP32 is an advanced choice with higher storage/RAM and potentially slower conversion. Fallback: use quantized. |
| Output format | App default lossless/intermediate preview format | Show output duration and size before saving or sharing. |

The configuration summary must include model, source type, extractor, index status/rate, chunk size, provider, precision, estimated peak RAM, estimated storage, and a plain-language performance statement: **“Conversion time varies by device, model, clip length, and settings. This app does not guarantee real-time conversion.”**

## Source-audio handoff, conversion, and preview

A speech-to-speech handoff accepts a recorded clip or imported audio after permission and file validation. It displays duration, waveform or equivalent accessible metadata, source filename, and a replace/remove action. A TTS handoff displays the originating text or a concise text identifier, the fact that audio will be synthesized first, and a way to return to TTS settings before conversion. The user must explicitly choose **Convert this audio**; opening the flow must not start recording, synthesis, upload, or conversion.

Before starting, present a final review step with the source type and all non-default settings. If the source is longer than the supported limit, offer trim or choose another clip. If the source format is unsupported, offer conversion through the app’s local decoder when available or select another file. The start action is disabled until a valid source, installed model, and compatible provider are present.

During conversion, show determinate progress when available and otherwise show an indeterminate state with elapsed time. The progress view must expose **Cancel conversion** and must not claim remaining time when it cannot be estimated. Cancellation stops new work, retains no output as if complete, and offers **Try again** or **Change settings**. If a partial output is technically retained for recovery, label it incomplete and keep it out of the normal output list.

On success, show an output preview with play/pause, seek, duration, source type, selected model, and a non-real-time disclaimer. Provide **Save**, **Share**, **Convert again**, and **Discard**. Save and share are separate actions; preview playback is local by default. If playback fails, retain the output and provide **Retry playback**, **Export file**, and **Discard**. If conversion fails, map the error to a plain-language reason and fallback: insufficient memory → smaller chunk/quantized model; unsupported ABI/provider → CPU or compatible model; invalid source → choose/trim another clip; thermal/power protection → cool device and retry later; unknown error → retry and report diagnostics.

## Warning and fallback copy

Warnings are adjacent to the relevant decision, use plain language, and always provide a next action. They should be announced to assistive technology before the control that triggers the risk.

| Risk | Warning copy | Actionable fallback |
| --- | --- | --- |
| RAM | “This model and these settings may use most of your available memory. Other apps may close, or conversion may fail.” | “Use the recommended quantized model or a smaller chunk size.” |
| Storage | “You need space for the download, temporary files, and the installed model. Keep at least {{required}} free.” | “Choose a smaller model or free storage.” |
| Thermal/power | “Long conversions can warm the device and use significant battery. Performance may slow as the device protects itself.” | “Plug in, remove the case if appropriate, shorten the clip, or try later.” |
| Latency | “Conversion may take longer than the source audio. Real-time performance is not guaranteed.” | “Use a shorter clip, smaller model, or recommended settings.” |
| Unsupported ABI | “This model does not support this device architecture.” | “Choose a model marked compatible with {{abi}} or use standard TTS.” |
| Provider fallback | “{{provider}} is unavailable, so conversion will use CPU. It may be slower and use more battery.” | “Continue on CPU or choose another compatible provider/model.” |
| Quality loss | “Quantization, high index rate, or an incompatible extractor can reduce clarity or add artifacts.” | “Use the recommended preset, lower index rate, or try another extractor.” |
| Voice consent | “Only convert audio and voices you have permission to use. Do not impersonate someone or mislead listeners.” | “Confirm permission or choose another source/target voice.” |
| Privacy | “Audio and generated output stay on this device unless you explicitly share them.” | “Review the share target, or keep the output local.” |

Warnings must not use color alone. A severe compatibility or storage warning blocks the risky action; a performance or quality warning is advisory and can be dismissed without changing the default.

## Localization contract

The localization system merges missing language keys from English, so the following stable keys should be added first to `en.json` and the `Translations` type in a later implementation. Translators should receive the descriptions and placeholders together with the strings. New keys should remain under a dedicated `rvc` namespace to prevent collisions and permit incremental translation; all user-visible copy, including accessibility labels, errors, consent, and warnings, must use these keys.

| Key | Purpose / placeholders |
| --- | --- |
| `rvc.title` | Feature title. |
| `rvc.optionalLabel` | Marks RVC as optional. |
| `rvc.firstRun.title` | First-run explainer title. |
| `rvc.firstRun.body` | Opt-in explanation. |
| `rvc.firstRun.enable` | Enable action. |
| `rvc.firstRun.notNow` | Dismiss action. |
| `rvc.firstRun.privacy` | Local-processing explanation. |
| `rvc.firstRun.consent` | Voice-permission explanation. |
| `rvc.model.selectTitle` | Model selection heading. |
| `rvc.model.install` | Install action. |
| `rvc.model.installed` | Installed state. |
| `rvc.model.installSize` | `{{size}}` download size. |
| `rvc.model.footprint` | `{{size}}` installed footprint. |
| `rvc.model.peakMemory` | `{{size}}` estimated peak RAM. |
| `rvc.model.compatibility` | Compatibility summary. |
| `rvc.model.chooseSmaller` | Storage/RAM fallback. |
| `rvc.install.confirmTitle` | Install confirmation. |
| `rvc.install.progress` | `{{percent}}`, `{{downloaded}}`, `{{total}}`. |
| `rvc.install.verifying` | Verification state. |
| `rvc.install.cancelTitle` | Cancellation confirmation. |
| `rvc.install.cancelMessage` | Partial-download cleanup explanation. |
| `rvc.install.retry` | Retry action. |
| `rvc.install.failed` | `{{reason}}` failure message. |
| `rvc.install.recovering` | Recovery/cleanup state. |
| `rvc.settings.title` | Configuration heading. |
| `rvc.settings.recommended` | Recommended preset label. |
| `rvc.settings.sourceSpeech` | Speech-to-speech label. |
| `rvc.settings.sourceTts` | TTS source-audio label. |
| `rvc.settings.pitchExtractor` | Extractor label. |
| `rvc.settings.index` | Index toggle label. |
| `rvc.settings.indexRate` | Index-rate label. |
| `rvc.settings.chunkSize` | Chunk-size label. |
| `rvc.settings.provider` | Provider label. |
| `rvc.settings.precision` | Precision label. |
| `rvc.settings.quantized` | Quantized choice. |
| `rvc.settings.fp32` | FP32 choice. |
| `rvc.settings.unsavedTitle` | Dirty-settings confirmation. |
| `rvc.settings.reset` | Reset RVC settings action. |
| `rvc.settings.resetMessage` | Reset scope and consequence. |
| `rvc.review.title` | Pre-conversion review heading. |
| `rvc.review.notRealtime` | No-real-time guarantee. |
| `rvc.review.convert` | Start conversion action. |
| `rvc.progress.title` | Conversion progress heading. |
| `rvc.progress.elapsed` | `{{elapsed}}` elapsed time. |
| `rvc.progress.cancel` | Cancel conversion action. |
| `rvc.progress.cancelTitle` | Cancellation confirmation. |
| `rvc.progress.cancelMessage` | Incomplete-output explanation. |
| `rvc.output.title` | Preview heading. |
| `rvc.output.play` | Play action. |
| `rvc.output.pause` | Pause action. |
| `rvc.output.save` | Save action. |
| `rvc.output.share` | Share action. |
| `rvc.output.convertAgain` | Repeat action. |
| `rvc.output.discard` | Discard action. |
| `rvc.output.incomplete` | Incomplete-output label. |
| `rvc.delete.title` | Delete confirmation. |
| `rvc.delete.message` | `{{modelName}}`, `{{size}}`. |
| `rvc.delete.keepOutputs` | Safe default output choice. |
| `rvc.delete.deleteOutputs` | Destructive cleanup choice. |
| `rvc.delete.confirm` | Delete action. |
| `rvc.warning.ram` | `{{available}}`, `{{required}}`. |
| `rvc.warning.storage` | `{{required}}`. |
| `rvc.warning.thermalPower` | Thermal/battery warning. |
| `rvc.warning.latency` | No-real-time warning. |
| `rvc.warning.unsupportedAbi` | `{{abi}}`. |
| `rvc.warning.providerFallback` | `{{provider}}`. |
| `rvc.warning.qualityLoss` | Quality warning. |
| `rvc.warning.voiceConsent` | Permission/anti-impersonation warning. |
| `rvc.warning.privacy` | Local-processing/share warning. |
| `rvc.fallback.smallerModel` | Smaller-model action. |
| `rvc.fallback.smallerChunk` | Smaller-chunk action. |
| `rvc.fallback.cpu` | CPU fallback action. |
| `rvc.fallback.standardTts` | Standard TTS fallback. |
| `rvc.fallback.chooseSource` | Replace-source action. |
| `rvc.a11y.progress` | `{{percent}}` or indeterminate progress label. |
| `rvc.a11y.warning` | Warning announcement prefix. |
| `rvc.a11y.sourceSummary` | Source type/duration summary. |
| `rvc.a11y.modelSummary` | Model compatibility summary. |
| `rvc.error.insufficientMemory` | Memory failure. |
| `rvc.error.invalidSource` | Invalid audio failure. |
| `rvc.error.unsupportedAbi` | ABI failure. |
| `rvc.error.providerUnavailable` | Provider failure. |
| `rvc.error.thermalProtection` | Thermal protection failure. |
| `rvc.error.unknown` | Generic failure. |

Translations should preserve placeholders, avoid idioms, keep “RVC” unchanged, distinguish “voice conversion” from “text-to-speech,” and support pluralization for files, bytes, seconds, and outputs. Right-to-left layouts must keep progress values and technical identifiers readable. Long translated warnings must wrap without clipping controls.

## Accessibility requirements

Every flow has a logical focus order: title and context, warning, primary control, secondary control, then advanced options. Sheets must announce opening and closing, trap focus while open, and return focus to the invoking control. Buttons must describe the consequence, such as “Delete RVC model and conversion outputs,” rather than only “Delete.” Toggles and sliders must expose current value, range, and whether the control is disabled by another setting. Progress must announce meaningful changes without interrupting every percentage point; indeterminate progress must say that progress cannot be estimated. Audio preview needs accessible play/pause, seek position, duration, and a non-audio alternative for status information.

Touch targets must meet the platform minimum, warnings must be readable at large text sizes, and contrast must meet the app’s existing theme accessibility expectations. Never communicate compatibility, danger, or quality only through color, icon, waveform shape, or haptic feedback.

## Privacy, consent, and data handling

The default processing path is local. The app must not upload source audio, model files, voice embeddings, or generated output as part of conversion. If a future provider requires remote processing, it must be a separately labeled provider with an explicit network/privacy confirmation before use. Logs and error reports should contain model/provider/settings identifiers and diagnostic metadata, not raw audio or generated output unless the user explicitly attaches it.

Before conversion, require an affirmative confirmation that the user has permission to use the source and target voice. The copy must prohibit impersonation, fraud, harassment, and misleading disclosure. Consent must be revisitable from settings, must not be inferred from installing a model, and must not be buried in a general terms screen. Sharing output must use the platform share sheet only after the user taps Share and must show the selected file before handoff where the platform permits.

## Component-level test scenarios

The later implementation should add focused tests without coupling them to exact layout. The following scenarios are the acceptance matrix.

| Component/area | Scenario | Expected result |
| --- | --- | --- |
| Opt-in sheet | First visit with feature disabled | Explainer is shown; no model download or audio access occurs. |
| Opt-in sheet | Tap Not now | Sheet closes and feature remains disabled. |
| Opt-in sheet | Tap Enable | Feature preference becomes enabled and model selection opens. |
| Model card | Compatible model with enough space | Install is enabled and confirmation includes size/RAM estimates. |
| Model card | Insufficient storage | Install is blocked; storage warning and smaller-model/free-space fallbacks are present. |
| Installer | Download progress | Progress, bytes, and ETA are rendered when available. |
| Installer | Cancel with partial data | Confirmation appears; completed state is not recorded; retry/delete recovery is offered. |
| Installer | Checksum/verification failure | Partial artifact is invalidated; retry and alternate-model actions are offered. |
| Installer | App restarts during download | Registry reconciles temporary files and resumes only verified work. |
| Configuration | Open installed model | Safe defaults are selected and all estimates are visible. |
| Configuration | Enable index | Index rate becomes available and index storage/quality warning is announced. |
| Configuration | Select FP32 | RAM/storage warning appears; quantized fallback is offered. |
| Configuration | Unsupported extractor/provider | Choice is disabled with reason; compatible fallback remains actionable. |
| Configuration | Reset settings | Only RVC settings reset; feature/model/output data follows the documented reset scope. |
| Source handoff | Speech clip entry | Source is labeled speech-to-speech and shows duration/file metadata. |
| Source handoff | TTS entry | Source is labeled TTS source audio and identifies synthesis-before-conversion. |
| Source handoff | Invalid or overlong file | Conversion is disabled; trim/replace/compatible-format fallback is shown. |
| Review | Start conversion | Summary includes model, source type, settings, estimates, and no-real-time disclaimer. |
| Conversion | Determinate progress | Progress is accessible and cancel is available. |
| Conversion | Indeterminate progress | No fabricated ETA is shown; elapsed time and uncertainty are communicated. |
| Conversion | Cancel | No incomplete output is presented as successful; retry/change-settings actions appear. |
| Conversion | Memory/provider/thermal error | Error maps to plain language and offers the corresponding fallback. |
| Preview | Successful conversion | Playback, seek, duration, source type, model, save/share/discard actions are available. |
| Preview | Playback failure | Output remains recoverable; retry playback/export/discard are offered. |
| Deletion | Delete installed model | Confirmation names model and reclaimable storage. |
| Deletion | Outputs exist | Keep outputs is the safe default; deleting outputs is explicit and separately confirmed. |
| Localization | Missing translated RVC key | English fallback renders without crashing or exposing a raw key. |
| Localization | RTL/long text | Technical values remain readable; controls wrap and remain accessible. |
| Privacy/consent | Consent not confirmed | Conversion cannot start; permission copy and alternate source action are visible. |
| Privacy/consent | Share output | Share is user initiated and only the selected output is handed off. |

## Definition of done for the future UI implementation

The implementation is ready to leave spike status when every lifecycle state has a deterministic rendering and recovery path; every risky option has an adjacent warning and actionable fallback; speech-to-speech and TTS source audio are distinct in copy and analytics; no copy promises real-time performance; all user-visible strings and accessibility labels use the `rvc.*` keys; settings reset and deletion scopes are explicit; local processing and voice consent are confirmed; and the component-level scenarios above pass on both a compatible device and a constrained/unknown-hardware fixture.

## References to existing repository patterns

The eventual implementation should preserve the existing model download/error conventions in `src/screens/ModelsScreen/ModelsScreen.tsx`, hardware facts and conservative recommendations in `src/screens/HardwareScreen/HardwareScreen.tsx` and `src/services/modelRecommendations.ts`, model configuration sheet behavior in `src/components/ModelSettingsSheet`, memory-warning presentation in `src/components/MemoryRequirement`, localization fallback behavior in `src/locales/index.ts`, and theme/accessibility tokens from `src/utils/theme.ts` and `src/hooks/useTheme.ts`.

> This document is the only intended product change in the spike branch. It deliberately does not add routes, controls, model loaders, audio processing, persistence, or screen changes.
