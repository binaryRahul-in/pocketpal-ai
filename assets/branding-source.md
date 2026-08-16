# MobiGPT branding source

The supplied app-icon source is the GitHub avatar at https://avatars.githubusercontent.com/u/166840758?v=4.

The source image was saved as `assets/mobigpt-avatar-source.png` and `assets/mobigpt-avatar-source.webp`.

MobiGPT is a user-visible rebrand only. Keep the React Native registration name `PocketPal`, Android application ID `com.pocketpallite`, namespace `com.pocketpal`, Java/Kotlin package paths, and other internal identifiers unchanged for upgrade compatibility. The visible Android label and documentation may use `MobiGPT`.

Before public distribution, confirm that the user has permission to use the avatar as an application icon. The image is a personal portrait, not a generic logo; launcher icon adaptation should preserve the source while applying Android-safe cropping/masking and should not imply official affiliation beyond the user’s intent.
The existing `mipmap-mdpi/ic_launcher.png` and `ic_launcher_round.png` resources have been replaced with the supplied avatar source. The same source will be propagated to the remaining existing density resource directories because this environment does not provide deterministic image resizing operations through the available file interface; Android will scale the source at runtime. A later production pass should generate purpose-sized density/adaptive-icon assets if visual QA identifies scaling artifacts.
The existing `mipmap-hdpi/ic_launcher.png` and `ic_launcher_round.png` resources have also been replaced with the supplied avatar source. The original filenames and resource references remain unchanged.
The existing `mipmap-xhdpi/ic_launcher.png` and `ic_launcher_round.png` resources have been replaced with the supplied avatar source. The same Android resource filenames are retained.
The existing `mipmap-xxhdpi/ic_launcher.png` and `ic_launcher_round.png` resources have been replaced with the supplied avatar source. The source remains attributable through this note.
The existing `mipmap-xxxhdpi/ic_launcher.png` and `ic_launcher_round.png` resources have been replaced with the supplied avatar source. All existing mdpi, hdpi, xhdpi, xxhdpi, and xxxhdpi launcher resource pairs now use the supplied image while preserving resource names and package identity.
