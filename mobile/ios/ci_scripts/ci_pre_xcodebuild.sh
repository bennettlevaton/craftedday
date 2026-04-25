#!/bin/sh
set -e

# Xcode Cloud runs this right before `xcodebuild`. We override Flutter's
# FLUTTER_BUILD_NUMBER (which comes from pubspec.yaml's +N) with Xcode
# Cloud's monotonic $CI_BUILD_NUMBER so we never have to bump pubspec
# for every TestFlight build.
#
# Marketing version (1.0.0) still comes from pubspec.yaml — bump that
# manually when shipping a new public version.

cd "$CI_PRIMARY_REPOSITORY_PATH/mobile/ios"

echo "→ Overriding FLUTTER_BUILD_NUMBER with CI_BUILD_NUMBER=$CI_BUILD_NUMBER"
echo "FLUTTER_BUILD_NUMBER=$CI_BUILD_NUMBER" >> Flutter/Generated.xcconfig

echo "✓ ci_pre_xcodebuild done"
