package com.pocketpal

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeRvcRuntimeSpec
import java.io.File

@ReactModule(name = NativeRvcRuntimeSpec.NAME)
class RvcRuntimeModule(reactContext: ReactApplicationContext) : NativeRvcRuntimeSpec(reactContext) {
  private var streaming = false
  private var cancelled = false

  init {
    try {
      System.loadLibrary("appmodules")
    } catch (_: UnsatisfiedLinkError) {
      // React Native may load the library later through SoLoader. The native
      // call reports a structured failure instead of crashing the JS bridge.
    }
  }

  private external fun nativeRunModelSmoke(modelPath: String): String

  override fun getName(): String = NativeRvcRuntimeSpec.NAME

  override fun getCapabilities(promise: Promise) {
    val result = Arguments.createMap()
    result.putBoolean("supported", true)
    result.putBoolean("streaming", false)
    result.putString("provider", "onnxruntime-cpu-cpp")
    result.putString("precision", "fp32")
    result.putArray("warnings", Arguments.createArray().apply {
      pushString("Native C++ ONNX tensor execution is available for validated local .onnx graphs.")
      pushString("Streaming AudioTrack conversion remains disabled until bounded end-to-end audio validation is complete.")
    })
    promise.resolve(result)
  }

  override fun validateModel(rootPath: String, promise: Promise) {
    try {
      val root = File(rootPath).canonicalFile
      val manifest = File(root, "manifest.json").canonicalFile
      val validPath = manifest.path.startsWith(root.path + File.separator)
      val result = Arguments.createMap()
      result.putBoolean("valid", validPath && manifest.isFile)
      result.putInt("estimatedRamBytes", 0)
      result.putArray("errors", Arguments.createArray().apply {
        if (!validPath) pushString("RVC model path escapes its root directory.")
        else if (!manifest.isFile) pushString("RVC model bundle is missing manifest.json.")
      })
      result.putArray("warnings", Arguments.createArray())
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("RVC_VALIDATE_FAILED", error.message, error)
    }
  }

  override fun convert(inputPath: String, outputPath: String, modelRootPath: String, optionsJson: String, promise: Promise) {
    try {
      val root = File(modelRootPath).canonicalFile
      val model = File(inputPath).canonicalFile
      val rootPrefix = root.path + File.separator
      require(model.path.startsWith(rootPrefix)) { "ONNX model must be inside the selected RVC model directory" }
      require(model.isFile) { "ONNX model file does not exist" }
      require(model.extension.equals("onnx", ignoreCase = true)) { "Native C++ execution accepts only .onnx model files" }
      require(model.length() in 1..512L * 1024L * 1024L) { "ONNX model size is outside the mobile safety limit" }

      val summary = nativeRunModelSmoke(model.path)
      require(summary.contains("\"valid\":true")) { "Native ONNX execution failed: $summary" }
      promise.resolve(summary)
    } catch (error: Exception) {
      promise.reject("RVC_NATIVE_INFERENCE_FAILED", error.message, error)
    }
  }

  override fun startStreaming(modelRootPath: String, optionsJson: String, promise: Promise) {
    streaming = false
    cancelled = false
    promise.resolve(false)
  }

  override fun writeStreamingPcm(base64Pcm16: String, sampleRate: Double, promise: Promise) {
    if (!streaming || cancelled) {
      promise.resolve(0)
      return
    }
    promise.resolve(0)
  }

  override fun stopStreaming(promise: Promise) {
    streaming = false
    promise.resolve(null)
  }

  override fun cancel(promise: Promise) {
    cancelled = true
    streaming = false
    promise.resolve(null)
  }
}
