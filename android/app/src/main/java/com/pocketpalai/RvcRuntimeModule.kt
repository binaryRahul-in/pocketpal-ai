package com.pocketpal

import android.os.Build
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

  override fun getName(): String = NativeRvcRuntimeSpec.NAME

  override fun getCapabilities(promise: Promise) {
    val result = Arguments.createMap()
    result.putBoolean("supported", true)
    result.putBoolean("streaming", false)
    result.putString("provider", "cpu")
    result.putString("precision", "fp32")
    result.putArray("warnings", Arguments.createArray().apply {
      pushString("Native streaming is staged behind the validated offline ONNX Runtime path.")
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
    promise.reject("RVC_NATIVE_NOT_READY", "The native streaming backend is not enabled; use offline ONNX Runtime conversion.")
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
