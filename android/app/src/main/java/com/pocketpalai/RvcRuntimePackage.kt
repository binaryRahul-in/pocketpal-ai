package com.pocketpal

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.pocketpal.specs.NativeRvcRuntimeSpec

class RvcRuntimePackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == NativeRvcRuntimeSpec.NAME) RvcRuntimeModule(reactContext) else null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        NativeRvcRuntimeSpec.NAME to ReactModuleInfo(
          NativeRvcRuntimeSpec.NAME,
          NativeRvcRuntimeSpec.NAME,
          false,
          false,
          true,
          false,
          true,
        ),
      )
    }
  }
}
