# Project-specific R8 rules for MobiGPT.
#
# Release builds use proguard-android-optimize.txt plus R8 resource shrinking.
# The Android app has manually registered TurboModules and one JNI method whose
# names are part of runtime contracts, so these classes must not be renamed or
# removed even when they are reached through string metadata/reflection.

# Preserve runtime annotations used by React Native module discovery.
-keepattributes *Annotation*
-keepattributes InnerClasses,EnclosingMethod,Signature

# Preserve the Android/RN launch surface.
-keep class com.pocketpal.MainApplication { *; }
-keep class com.pocketpal.MainActivity { *; }

# Preserve all app-owned native packages. This is intentionally scoped to the
# app namespace and does not disable shrinking for third-party dependencies.
# It protects manually registered TurboReactPackages, generated Native*Spec
# bases, Room/WorkManager entrypoints, and JNI class names.
-keep class com.pocketpal.** { *; }

# Preserve classes explicitly marked as React Native modules.
-keep @com.facebook.react.module.annotations.ReactModule class * { *; }

# Preserve native method declarations and their declaring class names. The
# hardware JNI symbol is Java_com_pocketpal_HardwareInfoModule_nativePurgeAll.
-keepclasseswithmembers,allowoptimization,includedescriptorclasses class * {
    native <methods>;
}
