#pragma once

#include <string>

namespace pocketpal::rvc {

struct RunSummary {
  std::string json;
};

// Loads one local ONNX graph, builds deterministic inputs for either the small
// fixture graph or the exported RVC net_g contract, runs CPU ONNX Runtime, and
// validates that the first output is a finite, non-empty tensor.
RunSummary run_model_summary(const std::string& model_path);

}  // namespace pocketpal::rvc

#ifdef __ANDROID__
#include <jni.h>

extern "C" JNIEXPORT jstring JNICALL
Java_com_pocketpal_RvcRuntimeModule_nativeRunModelSmoke(
    JNIEnv* env, jobject thiz, jstring model_path);
#endif

#ifndef __ANDROID__
int main(int argc, char** argv);
#endif

