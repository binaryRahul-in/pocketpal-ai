# PocketPal application CMake.
#
# Why this file exists at all: dropping `externalNativeBuild.cmake.path`
# in build.gradle disables the React Native plugin's auto-injection of
# its default-app-setup CMakeLists, so we own the `appmodules` library
# from here on. The `include(...)` below is what keeps autolinking,
# TurboModule registration, and prefab linkage to libreactnative.so
# working — i.e. it's what makes the app boot.
#
# Why our extra source lives in a subdirectory: RN's template at
# default-app-setup/ReactNative-application.cmake does
# `file(GLOB *.cpp)` non-recursively in this directory, treating
# the presence of any *.cpp here as "user owns OnLoad.cpp too."
# Keeping sources under `src/` leaves that glob empty so the upstream
# default-app-setup/OnLoad.cpp keeps being picked up. We then add our
# sources explicitly via `target_sources` after the include.

cmake_minimum_required(VERSION 3.13)
project(appmodules)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT DEFINED RVC_ORT_ROOT OR RVC_ORT_ROOT STREQUAL "")
    message(FATAL_ERROR "RVC_ORT_ROOT must point to the extracted ONNX Runtime Android AAR")
endif()

file(GLOB RVC_ORT_INCLUDE_DIRS "${RVC_ORT_ROOT}/headers")
set(onnxruntime-lib "${RVC_ORT_ROOT}/jni/${ANDROID_ABI}/libonnxruntime.so")
if(NOT RVC_ORT_INCLUDE_DIRS OR NOT EXISTS "${onnxruntime-lib}")
    message(FATAL_ERROR "Missing ONNX Runtime headers or native library for ${ANDROID_ABI}: ${onnxruntime-lib}")
endif()

find_library(log-lib log)

target_sources(${CMAKE_PROJECT_NAME} PRIVATE
    src/hardware_info.cpp
    src/rvc_stream_queue.cpp
    src/rvc_onnx_runner.cpp
)

target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE ${RVC_ORT_INCLUDE_DIRS})
target_link_libraries(${CMAKE_PROJECT_NAME} ${onnxruntime-lib} ${log-lib})
