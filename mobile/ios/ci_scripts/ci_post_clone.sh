#!/bin/sh
set -e

# Xcode Cloud runs this after checkout. We need to install Flutter and
# pre-build the Dart artifacts so the Runner.xcworkspace can archive cleanly.

echo "→ Installing Flutter via fvm-style clone (faster than brew on CI)"
git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$HOME/flutter"
export PATH="$HOME/flutter/bin:$PATH"
flutter --version
flutter precache --ios

cd "$CI_PRIMARY_REPOSITORY_PATH/mobile"

# pubspec.yaml declares .env as an asset (gitignored locally). Write the real
# values from Xcode Cloud env vars so dotenv reads them at runtime — relying on
# --dart-define alone breaks because xcodebuild archive re-runs flutter assemble
# without the defines, leaving String.fromEnvironment empty in the shipped app.
echo "→ Writing .env from Xcode Cloud env vars"
{
  echo "API_BASE_URL=$API_BASE_URL"
  echo "CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY"
  echo "REVENUECAT_API_KEY=$REVENUECAT_API_KEY"
} > .env

# Fail loudly if any required value wasn't set in the Xcode Cloud workflow —
# silently shipping an empty key produces a blank-screen app.
for var in API_BASE_URL CLERK_PUBLISHABLE_KEY REVENUECAT_API_KEY; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "✗ Missing required Xcode Cloud env var: $var" >&2
    exit 1
  fi
done

echo "→ flutter pub get"
flutter pub get

echo "→ flutter build ios --release --no-codesign"
flutter build ios --release --no-codesign

echo "→ pod install"
cd ios
pod install

echo "✓ ci_post_clone done"
