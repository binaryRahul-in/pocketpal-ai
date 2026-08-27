# Include this file from an Android debug target after the React Native/ORT
# package has populated ORT_BUILD_DIR and ORT_ABI. It intentionally creates a
# separate library from appmodules and all RVC native targets.
cmake_minimum_required(VERSION 3.18)

if(NOT ORT_BUILD_DIR OR NOT ORT_ABI)
  message(STATUS "ONNX spike: ORT_BUILD_DIR/ORT_ABI unset; target is disabled")
  return()
endif()

file(GLOB ORT_INCLUDE_DIRS "${ORT_BUILD_DIR}/onnxruntime-android-*.aar/headers")
file(GLOB ORT_LIBRARY_DIRS "${ORT_BUILD_DIR}/onnxruntime-android-*.aar/jni/${ORT_ABI}")
find_library(ORT_LIBRARY onnxruntime PATHS ${ORT_LIBRARY_DIRS} NO_CMAKE_FIND_ROOT_PATH)

add_library(pocketpal_onnxruntime_spike STATIC
  ../src/onnx_session.cpp)
target_include_directories(pocketpal_onnxruntime_spike PUBLIC
  ../include ${ORT_INCLUDE_DIRS})
target_compile_features(pocketpal_onnxruntime_spike PUBLIC cxx_std_17)
target_link_libraries(pocketpal_onnxruntime_spike PUBLIC ${ORT_LIBRARY})
